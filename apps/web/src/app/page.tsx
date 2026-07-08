'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/panel' : '/login');
  }, [loading, user, router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-text-muted">
      Cargando…
    </main>
  );
}
