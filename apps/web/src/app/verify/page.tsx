'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

type Estado = 'verificando' | 'ok' | 'error';

export default function Verify() {
  const { t } = useI18n();
  const [estado, setEstado] = useState<Estado>('verificando');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setEstado('error');
      return;
    }
    fetch('/api/public/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => setEstado(r.ok ? 'ok' : 'error'))
      .catch(() => setEstado('error'));
  }, []);

  const contenido = {
    verificando: { icon: '⏳', title: t('vf.checking'), body: t('vf.checkingBody'), color: '#6b6480' },
    ok: { icon: '✅', title: t('vf.ok'), body: t('vf.okBody'), color: '#178a4f' },
    error: { icon: '⚠️', title: t('vf.fail'), body: t('vf.failBody'), color: '#c0392b' },
  }[estado];

  return (
    <main style={{ minHeight: '100vh', background: '#faf7fc', color: '#25203a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 460, width: '100%', background: '#fff', borderRadius: 20, padding: '40px 32px', boxShadow: '0 10px 40px rgba(80,20,140,0.08)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: '#7e00dd', display: 'inline-block' }} />
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>ConnectHub</span>
        </div>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{contenido.icon}</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 10px', color: contenido.color }}>{contenido.title}</h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: '#4a4560' }}>{contenido.body}</p>
      </div>
    </main>
  );
}
