'use client';
import { useEffect, useRef, useState } from 'react';
import { loadConfig } from '@/lib/config';
import { useRouter } from 'next/navigation';
import { createSdk } from '@/lib/sdk';
import { tokenStore } from '@/lib/auth';
import type { Message, WsResponse } from '@strawberry/shared';
import { rid } from '@/lib/id';

// Paging + UI constants
const PAGE_SIZE = 20;
const SCROLL_NEAR_BOTTOM_PX = 80;
const TYPING_TIMEOUT_MS = 30_000;

// Expected WS data shape for get_messages
type GetMessagesData = { messages: Message[]; has_more: boolean; next_cursor: number };

// Stable key helpers to avoid React index-key issues when prepending pages
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h.toString(36);
};
const messageKey = (m: Message) => `${m.created_at}:${m.role}:${hash(m.content)}`;

export default function Chat() {
  const [cfg, setCfg] = useState<any>();
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [oldestCursor, setOldestCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('connecting…');
  const wsRef = useRef<any>(null);
  const startedRef = useRef(false);
  const [typing, setTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Refs to avoid stale state inside scroll callbacks
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const boundaryRetriedRef = useRef(false);
  const [pagingEnabled, setPagingEnabled] = useState(false);
  
  // Helper: stable message key
  // Debug logging helper (temporary): prints which messages were returned from server
  const logPage = (label: string, msgs: Message[]) => {
    try {
      const rows = (msgs || []).map((m, i) => ({
        idx: i,
        created_at: m.created_at,
        role: m.role,
        content: m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content,
      }));
      // eslint-disable-next-line no-console
      console.log(`[Chat] ${label} page (count=${msgs?.length ?? 0})`, rows);
    } catch {}
  };

  // Load older messages (one page) when near top
  const loadOlder = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (loadingRef.current) return;
    if (!hasMoreRef.current) return;
    if (oldestCursor === null) return;

    const el = listRef.current;
    if (!el) return;
    loadingRef.current = true;
    setIsLoadingPage(true);

    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;

    const reqId = rid();
    const off = ws.on('get_messages', (resp: WsResponse<GetMessagesData>) => {
      if (resp?.type === 'response' && resp.request_id === reqId) {
        off();
        if (resp.status_code !== 0) { loadingRef.current = false; setIsLoadingPage(false); return; }
        const data = (resp.data as GetMessagesData) || { messages: [], has_more: false, next_cursor: oldestCursor ?? 0 };
        const pageMsgs = data.messages || [];
        if (pageMsgs.length) logPage('older get_messages', pageMsgs);

        if (pageMsgs.length) {
          shouldScrollBottomRef.current = false;
          setMessages((prev) => {
            const seen = new Set<string>();
            const merged = [...pageMsgs, ...prev];
            const out: Message[] = [];
            for (const m of merged) {
              const k = messageKey(m);
              if (!seen.has(k)) { seen.add(k); out.push(m); }
            }
            return out;
          });
          setOldestCursor((data.next_cursor ?? oldestCursor) as number | null);
          hasMoreRef.current = !!data.has_more;
          setHasMore(!!data.has_more);
          boundaryRetriedRef.current = false;

          // Preserve scroll position after prepend
          requestAnimationFrame(() => {
            const newScrollHeight = el.scrollHeight;
            const delta = newScrollHeight - prevScrollHeight;
            el.scrollTop = prevScrollTop + delta;
          });
        } else if (!data.has_more && hasMoreRef.current && oldestCursor && !boundaryRetriedRef.current) {
          // Single boundary retry with before-1 for strict older-than servers
          boundaryRetriedRef.current = true;
          const reqId2 = rid();
          const off2 = ws.on('get_messages', (resp2: WsResponse<GetMessagesData>) => {
            if (resp2?.type === 'response' && resp2.request_id === reqId2) {
              off2();
              // Re-run merge handling
              if (resp2.status_code === 0) {
                const d2 = (resp2.data as GetMessagesData) || { messages: [], has_more: false, next_cursor: oldestCursor ?? 0 };
                const pg2 = d2.messages || [];
                if (pg2.length) {
                  shouldScrollBottomRef.current = false;
                  setMessages((prev) => {
                    const seen = new Set<string>();
                    const merged = [...pg2, ...prev];
                    const out: Message[] = [];
                    for (const m of merged) { const k = messageKey(m); if (!seen.has(k)) { seen.add(k); out.push(m); } }
                    return out;
                  });
                  setOldestCursor((d2.next_cursor ?? oldestCursor) as number | null);
                  hasMoreRef.current = !!d2.has_more;
                  setHasMore(!!d2.has_more);
                  requestAnimationFrame(() => {
                    const newScrollHeight = el.scrollHeight;
                    const delta = newScrollHeight - prevScrollHeight;
                    el.scrollTop = prevScrollTop + delta;
                  });
                } else {
                  hasMoreRef.current = !!d2.has_more;
                  setHasMore(!!d2.has_more);
                }
              }
              loadingRef.current = false;
              setIsLoadingPage(false);
            }
          });
          try { ws.send('get_messages', { count: PAGE_SIZE, before: (oldestCursor as number) - 1 } as any, reqId2); } catch { off2(); }
          return;
        } else {
          hasMoreRef.current = !!data.has_more;
          setHasMore(!!data.has_more);
        }

        loadingRef.current = false;
        setIsLoadingPage(false);
      }
    });
    try { ws.send('get_messages', { count: PAGE_SIZE, before: oldestCursor as number } as any, reqId); } catch { off(); loadingRef.current = false; setIsLoadingPage(false); }
  };

  const router = useRouter();

  // Ensure consistent SSR/CSR markup and handle auth + config on mount only
  useEffect(() => {
    setMounted(true);
    const t = tokenStore.get();
    if (!t) {
      router.replace('/');
      return;
    }
    loadConfig().then(setCfg).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { loadingRef.current = isLoadingPage; }, [isLoadingPage]);

  // Auto-scroll selectively: stick to bottom on send/assistant reply or if already near bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const should = shouldScrollBottomRef.current;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < SCROLL_NEAR_BOTTOM_PX;
    if (should || nearBottom || typing) {
      const behavior: ScrollBehavior = should ? 'auto' : 'smooth';
      // Wait for DOM to paint messages before scrolling
      requestAnimationFrame(() => {
        try { bottomRef.current?.scrollIntoView({ behavior, block: 'end' }); } catch {}
        shouldScrollBottomRef.current = false;
      });
    }
  }, [messages, typing]);

  useEffect(() => {
    if (!cfg) return;
    if (startedRef.current) return; // guard double-mount in React StrictMode
    const sdk = createSdk(cfg);
    const ws = (wsRef.current = sdk.ws());

    const requestGetMessages = <T extends object>(data: T, handler: (resp: WsResponse<GetMessagesData>) => void) => {
      const reqId = rid();
      const off = ws.on('get_messages', (resp: WsResponse<GetMessagesData>) => {
        if (resp?.type === 'response' && resp.request_id === reqId) {
          off();
          handler(resp);
        }
      });
      try { ws.send('get_messages', data as any, reqId); } catch { off(); }
      return off;
    };

    ws.connect()
      .then(() => {
        setStatus('connected');
        requestGetMessages({ count: PAGE_SIZE }, (resp) => {
          if (resp.status_code === 0) {
            const data = (resp.data as GetMessagesData) || { messages: [], has_more: false, next_cursor: 0 };
            const initial = (data.messages || []).slice();
            logPage('initial get_messages', initial);
            setOldestCursor((data.next_cursor as number) ?? null);
            setHasMore(!!data.has_more);
            hasMoreRef.current = !!data.has_more;
            boundaryRetriedRef.current = false;
            // Initial render: set exactly what server returned and scroll to bottom
            shouldScrollBottomRef.current = true;
            setMessages(initial);
          }
        });
      })
      .catch((e: any) => setStatus('error ' + e.message));

    const off = ws.on('new_message', (evt: any) => {
      const m = evt?.data?.message;
      if (m && m.role === 'assistant') {
        setTyping(false);
        if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
        shouldScrollBottomRef.current = true;
        // Append assistant reply safely even if initial page arrives slightly later
        setMessages((prev) => {
          // If message already present (dedupe), don't duplicate
          const k = messageKey(m as Message);
          if (prev.find((x) => messageKey(x) === k)) return prev;
          return [...prev, m as Message];
        });
      }
    });
    startedRef.current = true;
    return () => {
      off && off();
      if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      try { wsRef.current?.close?.(); } catch {}
      startedRef.current = false;
    };
  }, [cfg]);

  // Single scroll-based infinite loader
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const atTop = el.scrollTop <= 2;
      if (atTop && !pagingEnabled) setPagingEnabled(true);
      if (atTop && pagingEnabled) loadOlder();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pagingEnabled, oldestCursor]);

  // (Optional) could auto-fill if not scrollable; intentionally skipped to avoid extra requests on load

  const send = async (e: any) => {
    e.preventDefault();
    if (!content.trim()) return;
    // Optimistic user message
    shouldScrollBottomRef.current = true;
    setMessages((prev) => [...prev, { role: 'user', name: 'owner', content, created_at: Date.now() }]);
    const toSend = content;
    setContent('');
    try {
      const sdk = createSdk(cfg);
      const ack: { status: string; stream: boolean } = await sdk.api.sendMessage(toSend);
      if (ack && ack.status === 'accepted') {
        setTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(false), TYPING_TIMEOUT_MS);
      }
    } catch {}
  };

  if (!mounted || !cfg) return <div>Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-5 h-[100svh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Chat</h2>
        <small className="text-muted-foreground">{status}</small>
      </div>
      <div ref={listRef} className="border border-border rounded-md p-3 flex-1 overflow-auto mb-3 bg-card text-card-foreground space-y-2">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div key={`${messageKey(m)}#${idx}`} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  (isUser
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-accent text-accent-foreground border border-border rounded-tl-none') +
                  ' rounded-2xl px-3 py-2 text-base max-w-[75%] whitespace-pre-wrap break-words'
                }
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-accent text-accent-foreground border border-border rounded-2xl rounded-tl-none px-3 py-2 text-base max-w-[75%]">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-px" />
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button type="submit" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-base hover:opacity-90">
          Send
        </button>
      </form>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="typing-ind">
      <span className="bubble" />
      <span className="bubble" />
      <span className="bubble" />
      <style jsx>{`
        .typing-ind { display: inline-flex; gap: 6px; align-items: flex-end; margin-left: 6px; }
        .bubble { width: 8px; height: 8px; border-radius: 50%; background: #888; opacity: 0.85; animation: bounce 1.1s infinite ease-in-out; }
        .bubble:nth-child(1) { animation-delay: 0s; }
        .bubble:nth-child(2) { animation-delay: 0.15s; }
        .bubble:nth-child(3) { animation-delay: 0.30s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}
