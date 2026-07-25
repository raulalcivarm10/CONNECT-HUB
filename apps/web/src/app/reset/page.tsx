'use client';

import { useState } from 'react';

export default function Reset() {
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<'form' | 'sending' | 'ok'>('form');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setMsg('Invalid link.'); return; }
    if (password.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    setMsg('');
    setEstado('sending');
    try {
      const r = await fetch('/api/public/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (r.ok) setEstado('ok');
      else { setEstado('form'); setMsg('This link is invalid or has expired. Request a new one from the app.'); }
    } catch {
      setEstado('form');
      setMsg('Could not connect. Please try again.');
    }
  }

  const card: React.CSSProperties = { maxWidth: 440, width: '100%', background: '#fff', borderRadius: 20, padding: '40px 32px', boxShadow: '0 10px 40px rgba(80,20,140,0.08)' };
  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, justifyContent: 'center' }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: '#7e00dd', display: 'inline-block' }} />
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>ConnectHub</span>
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#faf7fc', color: '#25203a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {estado === 'ok' ? (
        <div style={{ ...card, textAlign: 'center' }}>
          {brand}
          <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 10px', color: '#178a4f' }}>Password updated</h1>
          <p style={{ margin: 0, lineHeight: 1.6, color: '#4a4560' }}>You can now go back to the app and sign in with your new password.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} style={card}>
          {brand}
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 6px', textAlign: 'center' }}>New password</h1>
          <p style={{ margin: '0 0 18px', lineHeight: 1.6, color: '#6b6480', textAlign: 'center', fontSize: 14 }}>Enter a new password for your ConnectHub account.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min. 8)"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 12, border: '1.5px solid #e4dcee', padding: '0 14px', fontSize: 15, marginBottom: 10 }}
          />
          {msg ? <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 10px' }}>{msg}</p> : null}
          <button
            type="submit"
            disabled={estado === 'sending'}
            style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: '#7e00dd', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: estado === 'sending' ? 0.7 : 1 }}
          >
            {estado === 'sending' ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </main>
  );
}
