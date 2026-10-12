'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Ricarica i dati della pagina a intervalli mentre qualcosa è in corso (es. analisi PageSpeed in sottofondo).
// Si ferma da sola dopo `maxMs` per non continuare all'infinito.
export function AutoRefresh({ active, everyMs = 8000, maxMs = 180000 }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return undefined;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > maxMs) clearInterval(t);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, maxMs, router]);
  return null;
}
