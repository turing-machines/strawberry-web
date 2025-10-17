'use client';
import { useState, useEffect } from 'react';
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
    <div style={{ maxWidth: 360, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      <form onSubmit={submit}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: 8 }}
        />
        <br />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: 8, padding: 8 }}
        />
        <br />
        {mode === 'register' && (
          <input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', marginBottom: 8, padding: 8 }}
          />
        )}
        <button type="submit" style={{ padding: '8px 12px' }}>
          {mode === 'login' ? 'Login' : 'Register'}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        style={{ marginTop: 8 }}
      >
        Switch to {mode === 'login' ? 'register' : 'login'}
      </button>
      <div style={{ color: 'crimson', marginTop: 8 }}>{msg}</div>
    </div>
  );
}
