'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { toast } from 'src/components/snackbar';

import { reportClientError } from './error-actions';

// ----------------------------------------------------------------------
// Registra nel «Registro errori» ogni messaggio d'errore mostrato all'utente e gli errori JavaScript della pagina.

let patched = false;
let currentPath = '/';

export function ErrorReporter() {
  const pathname = usePathname();
  currentPath = pathname;

  useEffect(() => {
    if (!patched) {
      patched = true;
      const original = toast.error;
      toast.error = (message, ...rest) => {
        const text = typeof message === 'string' ? message : String(message?.props?.children ?? message ?? '');
        reportClientError(text, currentPath).catch(() => {});
        return original(message, ...rest);
      };
    }
    const onError = (e) => reportClientError(e.message || 'Errore JavaScript', currentPath, `${e.filename ?? ''}:${e.lineno ?? ''}\n${e.error?.stack ?? ''}`).catch(() => {});
    const onRejection = (e) => {
      const r = e.reason;
      reportClientError(r?.message || String(r) || 'Promessa rifiutata', currentPath, r?.stack ?? '').catch(() => {});
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
