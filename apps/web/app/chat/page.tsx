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
const CLOCK_DRIFT_MS = 2_000;

// Expected WS data shape for get_messages
type GetMessagesData = { messages: Message[]; has_more: boolean; next_cursor: number };

// Stable key helpers to avoid React index-key issues when prepending pages
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h.toString(36);
};
const messageKey = (m: Message) => `${m.created_at}:${m.role}:${hash(m.content)}`;

type ChatItem = Message & { images?: string[] };

function sanitizeUrl(u: string): string {
  // Trim trailing punctuation and brackets that often stick to pasted links
  return u.replace(/[\]\)>,;.!]+$/g, '');
}

function extractImageUrls(text?: string): string[] {
  if (!text) return [];
  const urls = new Set<string>();
  // Markdown image: ![alt](url)
  const mdImg = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(text)) !== null) {
    if (m[1]) urls.add(sanitizeUrl(m[1] as string));
  }
  // Plain urls ending with common image extensions
  const imgExt = /(https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg))/gi;
  while ((m = imgExt.exec(text)) !== null) {
    if (m[1]) urls.add(sanitizeUrl(m[1] as string));
  }
  // Generic URLs (may point to images without file extensions); we'll try to render and hide on error
  const generic = /(https?:\/\/[^\s]+)/gi;
  while ((m = generic.exec(text)) !== null) {
    if (m[1]) urls.add(sanitizeUrl(m[1] as string));
  }
  return Array.from(urls);
}

function extractImagesFromEvent(evt: any): string[] {
  const imgs: string[] = [];
  // Try common locations
  const cand = evt?.data?.images || evt?.data?.message?.images || [];
  if (Array.isArray(cand)) {
    for (const u of cand) if (typeof u === 'string') imgs.push(u);
  }
  // Fallback: parse from message content
  const fromText = extractImageUrls(evt?.data?.message?.content);
  return Array.from(new Set([...(imgs || []), ...fromText]));
}

type ContentBlock = { type: 'text'; text: string } | { type: 'gallery'; urls: string[]; count?: number };
function parseContentBlocks(text?: string): { blocks: ContentBlock[]; contentUrls: Set<string> } {
  const blocks: ContentBlock[] = [];
  const contentUrls = new Set<string>();
  if (!text) return { blocks, contentUrls };
  const lines = text.split(/\r?\n/);
  let gallery: string[] = [];
  let galleryCount = 0; // for placeholder-based galleries
  let paragraph: string[] = [];
  let pendingBlanks = 0; // blank lines encountered while in gallery mode
  const isUrlOnly = (s: string) => /^https?:\/\/\S+$/.test(s.trim());
  const placeholderCount = (s: string) => {
    const t = s.trim().toLowerCase();
    if (!t) return 0;
    // count words strictly equal to 'image'
    return t.split(/\s+/).reduce((acc, w) => acc + (w === 'image' ? 1 : 0), 0);
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'text', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushGallery = () => {
    if (gallery.length) {
      blocks.push({ type: 'gallery', urls: gallery });
      gallery = [];
    }
    if (galleryCount > 0) {
      blocks.push({ type: 'gallery', urls: [], count: galleryCount });
      galleryCount = 0;
    }
  };
  for (const raw of lines) {
    const line = raw; // keep original spacing for text
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // If we are in gallery mode, keep blanks to insert before the next text paragraph
      if (gallery.length > 0 || galleryCount > 0) {
        pendingBlanks++;
        continue;
      }
      flushGallery();
      paragraph.push('');
      continue;
    }
    if (isUrlOnly(trimmed)) {
      // URL-only line becomes part of a gallery
      if (gallery.length === 0 && galleryCount === 0) flushParagraph();
      const u = sanitizeUrl(trimmed);
      gallery.push(u);
      contentUrls.add(u);
      continue;
    }
    const phc = placeholderCount(trimmed);
    if (phc > 0) {
      // If we're already accumulating a URL gallery, treat placeholder lines as spacing
      // so they do not split galleries or create duplicate placeholder galleries.
      if (gallery.length > 0) {
        continue;
      }
      // Otherwise, use placeholders to create a gallery from attachments only.
      if (gallery.length === 0 && galleryCount === 0) flushParagraph();
      galleryCount += phc;
      continue;
    }
    // non-URL line ends any gallery and is part of text
    flushGallery();
    // re-insert exactly one blank line after a gallery, regardless of how many were present
    if (pendingBlanks > 0) {
      paragraph.push('');
      pendingBlanks = 0;
    }
    paragraph.push(line);
  }
  flushGallery();
  // trailing blanks after gallery at EOF are not needed
  flushParagraph();
  return { blocks, contentUrls };
}

export default function Chat() {
  const [cfg, setCfg] = useState<any>();
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [oldestCursor, setOldestCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('connecting…');
  const wsRef = useRef<any>(null);
  const startedRef = useRef(false);
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [typingByAgent, setTypingByAgent] = useState<Record<number, number>>({});
  const typingTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Refs to avoid stale state inside scroll callbacks
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const boundaryRetriedRef = useRef(false);
  const [pagingEnabled, setPagingEnabled] = useState(false);
  // Timestamp of the most recent assistant reply we've rendered
  const lastAssistantTsRef = useRef<number>(0);
  // Timestamp of the most recent user message we initiated (optimistic send)
  const lastUserTsRef = useRef<number>(0);
  // Lightbox state
  const [lightbox, setLightbox] = useState<{ msgIdx: number; imgIdx: number } | null>(null);
  
  // Helper: stable message key

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
        // Convert incoming history messages to ChatItem with images extracted from content
        const pageMsgs: ChatItem[] = (data.messages || []).map((msg) => ({
          ...(msg as Message),
          images: extractImageUrls((msg as Message).content),
        }));

        if (pageMsgs.length) {
          shouldScrollBottomRef.current = false;
          setMessages((prev) => {
            const seen = new Set<string>();
            const merged: ChatItem[] = [...pageMsgs, ...prev];
            const out: ChatItem[] = [];
            for (const m of merged) {
              const k = messageKey(m as Message);
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
                const pg2: ChatItem[] = (d2.messages || []).map((msg) => ({
                  ...(msg as Message),
                  images: extractImageUrls((msg as Message).content),
                }));
                if (pg2.length) {
                  shouldScrollBottomRef.current = false;
                  setMessages((prev) => {
                    const seen = new Set<string>();
                    const merged: ChatItem[] = [...pg2, ...prev];
                    const out: ChatItem[] = [];
                    for (const m of merged) { const k = messageKey(m as Message); if (!seen.has(k)) { seen.add(k); out.push(m); } }
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
  const isTyping = activeAgentId != null
    ? typingByAgent[activeAgentId!] !== undefined
    : Object.keys(typingByAgent).length > 0;

  const stopTyping = (agentId: number | null | undefined) => {
    if (agentId == null) return;
    setTypingByAgent((prev) => {
      if (!(agentId in prev)) return prev;
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
    const t = typingTimersRef.current.get(agentId);
    if (t) clearTimeout(t);
    typingTimersRef.current.delete(agentId);
  };

  const clearAllTyping = () => {
    setTypingByAgent({});
    typingTimersRef.current.forEach((t) => clearTimeout(t));
    typingTimersRef.current.clear();
  };

  const startTyping = (agentId: number, ts?: number) => {
    if (agentId == null) return;
    setTypingByAgent((prev) => ({ ...prev, [agentId]: ts || Date.now() }));
    const existing = typingTimersRef.current.get(agentId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => stopTyping(agentId), TYPING_TIMEOUT_MS);
    typingTimersRef.current.set(agentId, timer as unknown as NodeJS.Timeout);
  };

  // Auto-scroll selectively: stick to bottom on send/assistant reply or if already near bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const should = shouldScrollBottomRef.current;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < SCROLL_NEAR_BOTTOM_PX;
    if (should || nearBottom || isTyping) {
      const behavior: ScrollBehavior = should ? 'auto' : 'smooth';
      // Wait for DOM to paint messages before scrolling
      requestAnimationFrame(() => {
        try { bottomRef.current?.scrollIntoView({ behavior, block: 'end' }); } catch {}
        shouldScrollBottomRef.current = false;
      });
    }
  }, [messages, isTyping]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (ev: KeyboardEvent) => {
      if (!lightbox) return;
      if (ev.key === 'Escape') setLightbox(null);
      if (ev.key === 'ArrowRight') {
        setLightbox((s) => {
          if (!s) return s;
          const imgs = messages[s.msgIdx]?.images || [];
          if (!imgs.length) return null;
          return { msgIdx: s.msgIdx, imgIdx: (s.imgIdx + 1) % imgs.length };
        });
      }
      if (ev.key === 'ArrowLeft') {
        setLightbox((s) => {
          if (!s) return s;
          const imgs = messages[s.msgIdx]?.images || [];
          if (!imgs.length) return null;
          return { msgIdx: s.msgIdx, imgIdx: (s.imgIdx - 1 + imgs.length) % imgs.length };
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, messages]);

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
        // Resolve active agent id for this conversation (single-agent UI)
        const s = createSdk(cfg);
        s.api
          .agent()
          .then((a) => setActiveAgentId(a.agent_id))
          .catch((e: any) => {
            if (e?.auth_error === 'token_expired' || e?.auth_error === 'invalid_token') {
              try { tokenStore.clear(); } catch {}
              router.replace('/');
            }
          });
        requestGetMessages({ count: PAGE_SIZE }, (resp) => {
          if (resp.status_code === 0) {
            const data = (resp.data as GetMessagesData) || { messages: [], has_more: false, next_cursor: 0 };
            const initial: ChatItem[] = (data.messages || []).map((msg) => ({
              ...(msg as Message),
              images: extractImageUrls((msg as Message).content),
            }));
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
      .catch((_e: any) => {
        // Do not force logout on server unavailability; ws client will auto-reconnect
        setStatus('disconnected');
      });

    const offNew = ws.on('new_message', (evt: any) => {
      const m = evt?.data?.message;
      if (m && m.role === 'assistant') {
        // Remember when the latest assistant reply arrived
        if (typeof m.created_at === 'number') lastAssistantTsRef.current = m.created_at;
        // Stop typing for this conversation's agent
        if (activeAgentId != null) stopTyping(activeAgentId);
        else clearAllTyping();
        shouldScrollBottomRef.current = true;
        // Append assistant reply safely even if initial page arrives slightly later
        const images = extractImagesFromEvent(evt);
        setMessages((prev) => {
          // If message already present (dedupe), don't duplicate
          const k = messageKey(m as Message);
          if (prev.find((x) => messageKey(x) === k)) return prev;
          return [...prev, { ...(m as Message), images } as ChatItem];
        });
      }
    });
    const offPrep = ws.on('agent_preparing', (evt: any) => {
      const agentId = evt?.data?.agent_id as number | undefined;
      const ts = (evt?.data?.ts_ms as number | undefined) ?? Date.now();
      // Guard: ignore stale events clearly older than the latest assistant reply (allow small drift)
      if (agentId != null) {
        const minTs = lastAssistantTsRef.current ? lastAssistantTsRef.current - CLOCK_DRIFT_MS : 0;
        if (ts >= minTs) startTyping(agentId, ts);
      }
    });
    const offNoReply = ws.on('agent_no_reply', (evt: any) => {
      const agentId = evt?.data?.agent_id as number | undefined;
      if (agentId != null) stopTyping(agentId);
    });
    startedRef.current = true;
    return () => {
      offNew && offNew();
      offPrep && offPrep();
      offNoReply && offNoReply();
      // Clear any pending typing timers
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
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
    const now = Date.now();
    lastUserTsRef.current = now;
    setMessages((prev) => [
      ...prev,
      { role: 'user', name: 'owner', content, created_at: now, images: extractImageUrls(content) } as ChatItem,
    ]);
    const toSend = content;
    setContent('');
    try {
      const sdk = createSdk(cfg);
      await sdk.api.sendMessage(toSend);
    } catch (e: any) {
      if (e?.auth_error === 'token_expired' || e?.auth_error === 'invalid_token') {
        try { tokenStore.clear(); } catch {}
        router.replace('/');
      }
    }
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
          const onImgError = (imgIndex: number) => {
            setMessages((prev) => {
              const next = prev.slice();
              const item: ChatItem = { ...(next[idx] as ChatItem) };
              const imgs = (item.images || []).slice();
              imgs.splice(imgIndex, 1);
              item.images = imgs;
              next[idx] = item;
              return next as ChatItem[];
            });
          };
          // helper to remove an image URL from this message
          const removeImgUrl = (url: string) => {
            setMessages((prev) => {
              const next = prev.slice();
              const item: ChatItem = { ...(next[idx] as ChatItem) };
              item.images = (item.images || []).filter((u) => u !== url);
              next[idx] = item;
              return next as ChatItem[];
            });
          };
          const { blocks, contentUrls } = parseContentBlocks(m.content);
          const attachments = (m.images || []).filter((u) => !contentUrls.has(u));
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
                {/* Render blocks: consecutive URL-only lines become a single gallery */}
                <div className="[&>a]:underline whitespace-pre-wrap">
                  {(() => {
                    // Clone attachments array to consume for placeholder galleries
                    const pending = attachments.slice();
                    return blocks.map((b, bi) => {
                      if (b.type === 'text') return <div key={bi}>{b.text}</div>;
                      let urls = b.urls || [];
                      if ((!urls || urls.length === 0) && b.count && b.count > 0) {
                        urls = pending.splice(0, b.count);
                      }
                      if (!urls || urls.length === 0) return <div key={bi} />;
                      return (
                        <div key={bi}>
                          {/* Show the original links first, then the gallery */}
                          <div className="whitespace-pre-wrap">
                            {urls.map((src, li) => (
                              <div key={li}>
                                <a href={src} target="_blank" rel="noreferrer" className="underline">
                                  {src}
                                </a>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {urls.map((src, i) => {
                          let globalIdx = (m.images || []).indexOf(src);
                          const openLb = (e: React.MouseEvent) => {
                            e.preventDefault();
                            setMessages((prev) => {
                              // Ensure this URL exists in the message images for lightbox navigation
                              const next = prev.slice();
                              const item: ChatItem = { ...(next[idx] as ChatItem) };
                              const imgs = item.images ? item.images.slice() : [];
                              let gi = imgs.indexOf(src);
                              if (gi < 0) {
                                imgs.push(src);
                                gi = imgs.length - 1;
                              }
                              item.images = imgs;
                              next[idx] = item;
                              // set lightbox after state update
                              setTimeout(() => setLightbox({ msgIdx: idx, imgIdx: gi }), 0);
                              return next as ChatItem[];
                            });
                          };
                              return (
                                <a key={i} href={src} target="_blank" rel="noreferrer" onClick={openLb}>
                                  <img
                                    src={src}
                                    alt="image"
                                    className="max-h-40 w-full object-cover rounded-md border border-border"
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={() => removeImgUrl(src)}
                                  />
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {/* Render non-inline attachments (images present in message metadata but not in text) */}
                {attachments.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {attachments.map((src, i) => {
                      const globalIdx = (m.images || []).indexOf(src);
                      const openLb = (e: React.MouseEvent) => {
                        e.preventDefault();
                        if (globalIdx >= 0) setLightbox({ msgIdx: idx, imgIdx: globalIdx });
                      };
                      return (
                        <a key={i} href={src} target="_blank" rel="noreferrer" onClick={openLb}>
                          <img
                            src={src}
                            alt="image"
                            className="max-h-40 w-full object-cover rounded-md border border-border"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() => removeImgUrl(src)}
                          />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {lightbox && (() => {
          const imgs = messages[lightbox.msgIdx]?.images || [];
          const src = imgs[lightbox.imgIdx];
          if (!src) return null;
          const close = () => setLightbox(null);
          const next = () => setLightbox({ msgIdx: lightbox.msgIdx, imgIdx: (lightbox.imgIdx + 1) % imgs.length });
          const prev = () => setLightbox({ msgIdx: lightbox.msgIdx, imgIdx: (lightbox.imgIdx - 1 + imgs.length) % imgs.length });
          return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={close} role="dialog" aria-modal="true">
              <div className="relative max-w-[95vw] max-h-[90vh]">
                <img
                  src={src}
                  alt="image"
                  className="max-w-[95vw] max-h-[90vh] object-contain rounded-md"
                  onClick={(e) => e.stopPropagation()}
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); close(); }}
                  className="absolute top-2 right-2 rounded-md bg-black/60 text-white px-2 py-1 text-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
                {imgs.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prev(); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white w-10 h-10 flex items-center justify-center"
                      aria-label="Previous"
                    >
                      ‹
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); next(); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white w-10 h-10 flex items-center justify-center"
                      aria-label="Next"
                    >
                      ›
                    </button>
                  </>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/80 text-xs">
                  {lightbox.imgIdx + 1} / {imgs.length}
                  {' '}
                  <a href={src} target="_blank" rel="noreferrer" className="underline ml-2">Open</a>
                </div>
              </div>
            </div>
          );
        })()}
        {lightbox && (() => {
          const imgs = messages[lightbox.msgIdx]?.images || [];
          const src = imgs[lightbox.imgIdx];
          if (!src) return null;
          const close = () => setLightbox(null);
          const next = () => setLightbox({ msgIdx: lightbox.msgIdx, imgIdx: (lightbox.imgIdx + 1) % imgs.length });
          const prev = () => setLightbox({ msgIdx: lightbox.msgIdx, imgIdx: (lightbox.imgIdx - 1 + imgs.length) % imgs.length });
          return (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={close} role="dialog" aria-modal="true">
              <div className="relative max-w-[95vw] max-h-[90vh]">
                <img
                  src={src}
                  alt="image"
                  className="max-w-[95vw] max-h-[90vh] object-contain rounded-md"
                  onClick={(e) => e.stopPropagation()}
                  referrerPolicy="no-referrer"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); close(); }}
                  className="absolute top-2 right-2 rounded-md bg-black/60 text-white px-2 py-1 text-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
                {imgs.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prev(); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white w-10 h-10 flex items-center justify-center"
                      aria-label="Previous"
                    >
                      ‹
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); next(); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 text-white w-10 h-10 flex items-center justify-center"
                      aria-label="Next"
                    >
                      ›
                    </button>
                  </>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/80 text-xs">
                  {lightbox.imgIdx + 1} / {imgs.length}
                  {' '}
                  <a href={src} target="_blank" rel="noreferrer" className="underline ml-2">Open</a>
                </div>
              </div>
            </div>
          );
        })()}
        {isTyping && (
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
