'use client';
import { useEffect, useRef, useState } from 'react';
import { loadConfig } from '@/lib/config';
import { createSdk } from '@/lib/sdk';
import { tokenStore } from '@/lib/auth';
import type { Message, WsResponse } from '@strawberry/shared';
import { rid } from '@/lib/id';

export default function Chat() {
  const [cfg, setCfg] = useState<any>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('connecting…');
  const wsRef = useRef<any>(null);
  const startedRef = useRef(false);
  const [typing, setTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadConfig().then(setCfg).catch(() => {});
  }, []);

  // Always keep the latest content/typing in view within the scroll container
  useEffect(() => {
    try {
      const el = listRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } catch {}
  }, [messages, typing]);

  useEffect(() => {
    if (!cfg) return;
    if (startedRef.current) return; // guard double-mount in React StrictMode
    const sdk = createSdk(cfg);
    // Connect WS and fetch initial messages via WS action
    const ws = (wsRef.current = sdk.ws());
    const reqId = rid();
    const offGet = ws.on('get_messages', (resp: WsResponse<{ messages: Message[] }>) => {
      if (resp?.type === 'response' && resp.request_id === reqId) {
        if ((resp as any).status_code === 0) {
          const data = (resp as any).data || {};
          setMessages((data as any).messages || []);
        }
        offGet();
      }
    });
    ws.connect()
      .then(() => {
        setStatus('connected');
        try { ws.send('get_messages', { count: 20 } as any, reqId); } catch {}
      })
      .catch((e: any) => setStatus('error ' + e.message));
    const off = ws.on('new_message', (evt: any) => {
      const m = evt?.data?.message;
      if (m && m.role === 'assistant') {
        setTyping(false);
        if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
        setMessages((prev) => [...prev, m]);
      }
    });
    startedRef.current = true;
    return () => {
      off && off();
      offGet && offGet();
      if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      try { wsRef.current?.close?.(); } catch {}
      startedRef.current = false;
    };
  }, [cfg]);

  const send = async (e: any) => {
    e.preventDefault();
    if (!content.trim()) return;
    // Optimistic user message
    setMessages((prev) => [...prev, { role: 'user', name: 'owner', content, created_at: Date.now() }]);
    const toSend = content;
    setContent('');
    try {
      const sdk = createSdk(cfg);
      const ack = await sdk.api.sendMessage(toSend);
      if (ack && (ack as any).status === 'accepted') {
        setTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTyping(false), 30000);
      }
    } catch {}
  };

  if (!tokenStore.get()) {
    if (typeof window !== 'undefined') location.href = '/';
    return <div />;
  }
  if (!cfg) return <div>Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-5 h-[100svh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Chat</h2>
        <small className="text-muted-foreground">{status}</small>
      </div>
      <div ref={listRef} className="border border-border rounded-md p-3 flex-1 overflow-auto mb-3 bg-card text-card-foreground space-y-2">
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  (isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-accent-foreground border border-border') +
                  ' rounded-2xl px-3 py-2 text-sm max-w-[75%] whitespace-pre-wrap break-words'
                }
              >
                {m.content}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-accent text-accent-foreground border border-border rounded-2xl px-3 py-2 text-sm max-w-[75%]">
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button type="submit" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
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
