'use client';

import { useEffect, useState } from 'react';

type DependencyHealth =
  | { ok: true; latencyMs: number }
  | { ok: false; error: string };

type Health = {
  status: 'ok' | 'degraded';
  oracle: DependencyHealth;
  redis: DependencyHealth;
  timestamp: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function StatusRow({ name, dep }: { name: string; dep?: DependencyHealth }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-app bg-surface-2 px-4 py-3">
      <span className="font-medium text-text">{name}</span>
      {dep === undefined ? (
        <span className="text-text-muted">…</span>
      ) : dep.ok ? (
        <span className="text-success">● conectado · {dep.latencyMs} ms</span>
      ) : (
        <span className="text-danger" title={dep.error}>
          ● sin conexión
        </span>
      )}
    </div>
  );
}

export default function EstadoPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(`${API_URL}/health`)
        .then((r) => r.json())
        .then((h: Health) => {
          if (active) {
            setHealth(h);
            setApiDown(false);
          }
        })
        .catch(() => active && setApiDown(true));
    load();
    const id = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border-app bg-surface p-8 shadow-sm">
        <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-brand">
          Connect-Hub
        </div>
        <h1 className="mb-6 text-2xl font-bold text-text">
          Estado del sistema
        </h1>

        <div className="space-y-3">
          <StatusRow
            name="API"
            dep={
              apiDown
                ? { ok: false, error: 'API no responde' }
                : health
                  ? { ok: true, latencyMs: 0 }
                  : undefined
            }
          />
          <StatusRow name="Oracle (CONNECT_HUB)" dep={health?.oracle} />
          <StatusRow name="Redis (caché)" dep={health?.redis} />
        </div>
      </div>
    </main>
  );
}
