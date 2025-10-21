'use client';
import { useState, useEffect, useRef } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { loadConfig } from '@/lib/config';
import { createSdk } from '@/lib/sdk';
import { tokenStore } from '@/lib/auth';

export default function Home() {
  const [cfg, setCfg] = useState<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [msg, setMsg] = useState('');
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadConfig().then(setCfg).catch((e) => setMsg(e.message));
  }, []);

  if (!cfg) return <div style={{ fontFamily: 'sans-serif', padding: 20 }}>Loading config… {msg}</div>;
  const sdk = createSdk(cfg);

  const submit = async (e: any) => {
    e.preventDefault();
    try {
      const data =
        mode === 'login'
          ? await sdk.api.login({ email, password })
          : await sdk.api.register({ email, password, name });
      tokenStore.set(data.token);
      location.href = '/chat';
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  // Ensure LiquidGlass recalculates its internal size when our content resizes
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try { window.dispatchEvent(new Event('resize')); } catch {}
    });
    ro.observe(el);
    // Trigger once immediately as well
    try { window.dispatchEvent(new Event('resize')); } catch {}
    return () => ro.disconnect();
  }, []);

  // Also re-measure when switching modes (login/register)
  useEffect(() => {
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }, [mode]);

  return (
    <div className="min-h-[100svh] w-full relative px-4" style={{
      background: 'radial-gradient(circle at 20% 10%, rgba(255,0,128,0.25), transparent 40%), radial-gradient(circle at 80% 30%, rgba(0,128,255,0.2), transparent 40%), radial-gradient(circle at 50% 80%, rgba(0,255,200,0.15), transparent 40%)'
    }}>
      <LiquidGlass
        displacementScale={64}
        blurAmount={0.08}
        saturation={130}
        aberrationIntensity={1.5}
        elasticity={0.25}
        cornerRadius={16}
        padding="16px 20px"
        className="shadow-lg"
        overLight
        style={{ position: 'fixed', top: '50%', left: '50%' }}
      >
        <div ref={contentRef} className="w-[22rem] max-w-[90vw]">
          <h2 className="text-2xl font-semibold mb-4 drop-shadow">{mode === 'login' ? 'Login' : 'Register'}</h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="sr-only">Email</label>
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md text-white shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                <input
                  placeholder="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent px-4 py-3 text-sm placeholder-white/60 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="sr-only">Password</label>
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md text-white shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                <input
                  placeholder="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent px-4 py-3 text-sm placeholder-white/60 outline-none"
                />
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label className="sr-only">Name</label>
                <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md text-white shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                  <input
                    placeholder="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent px-4 py-3 text-sm placeholder-white/60 outline-none"
                  />
                </div>
              </div>
            )}
            <button
              type="submit"
              className="w-full rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md text-white px-4 py-3 text-sm shadow-[0_16px_70px_rgba(0,0,0,0.35)] hover:bg-white/15 active:scale-[0.98] transition"
            >
              {mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="mt-3 inline-flex items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md text-white px-3 py-1.5 text-xs shadow hover:bg-white/15"
          >
            Switch to {mode === 'login' ? 'register' : 'login'}
          </button>
          <div className="text-red-200 mt-3 text-sm">{msg}</div>
        </div>
      </LiquidGlass>
    </div>
  );
}
