'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveAutoRefresh({ intervalMs = 30000 }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, router, startTransition]);

  return null;
}
