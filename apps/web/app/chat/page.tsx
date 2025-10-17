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

  useEffect(() => {
    loadConfig().then(setCfg).catch(() => {});
  }, []);

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
      if (m && m.role === 'assistant') setMessages((prev) => [...prev, m]);
    });
    startedRef.current = true;
    return () => {
      off && off();
      offGet && offGet();
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
      await sdk.api.sendMessage(toSend);
    } catch {}
  };

  if (!tokenStore.get()) {
    if (typeof window !== 'undefined') location.href = '/';
    return <div />;
  }
  if (!cfg) return <div>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: '20px auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Chat</h2>
        <small>{status}</small>
      </div>
      <div style={{ border: '1px solid #ccc', padding: 12, height: 400, overflow: 'auto', marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <strong>{m.role === 'assistant' ? 'assistant' : 'you'}:</strong> {m.content}
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1 }}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
