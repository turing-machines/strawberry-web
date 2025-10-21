'use client';
import { useState, useEffect } from 'react';
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
        <div className="w-[22rem] max-w-[90vw]">
          <h2 className="text-xl font-semibold mb-3">{mode === 'login' ? 'Login' : 'Register'}</h2>
          <form onSubmit={submit} className="space-y-2">
            <input
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            {mode === 'register' && (
              <input
                placeholder="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            )}
            <button type="submit" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">
              {mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Switch to {mode === 'login' ? 'register' : 'login'}
          </button>
          <div className="text-red-600 mt-2 text-sm">{msg}</div>
        </div>
      </LiquidGlass>
    </div>
  );
}
