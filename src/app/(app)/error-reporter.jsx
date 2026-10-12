'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { toast } from 'src/components/snackbar';

import { reportClientError } from './error-actions';

// ----------------------------------------------------------------------
// Registra nel «Registro errori» ogni messaggio d'errore mostrato all'utente e gli errori JavaScript della pagina.

let patched = false;
let currentPath = '/';

/** Contesto tecnico del browser: indirizzo completo, browser, schermo, ora. */
const browserContext = () =>
  [
    `URL: ${window.location.href}`,
    `Browser: ${navigator.userAgent}`,
    `Schermo: ${window.innerWidth}×${window.innerHeight} (dpr ${window.devicePixelRatio})`,
    `Lingua: ${navigator.language} · Online: ${navigator.onLine ? 'sì' : 'no'}`,
    `Ora del browser: ${new Date().toISOString()}`,
  ].join('\n');

const fullPath = () => `${window.location.pathname}${window.location.search}`;

export function ErrorReporter() {
  const pathname = usePathname();
  currentPath = pathname;

  useEffect(() => {
    if (!patched) {
      patched = true;
      const original = toast.error;
      toast.error = (message, ...rest) => {
        const text = typeof message === 'string' ? message : String(message?.props?.children ?? message ?? '');
        // I messaggi rossi mostrati all'utente sono avvisi (es. «compila il campo»); gli errori veri li registra il server
        reportClientError(text, fullPath() || currentPath, browserContext(), 'avviso').catch(() => {});
        return original(message, ...rest);
      };
    }
    const onError = (e) => reportClientError(e.message || 'Errore JavaScript', fullPath(), `File: ${e.filename ?? ''}:${e.lineno ?? ''}:${e.colno ?? ''}\n${browserContext()}\n\n${e.error?.stack ?? ''}`).catch(() => {});
    const onRejection = (e) => {
      const r = e.reason;
      reportClientError(r?.message || String(r) || 'Promessa rifiutata', fullPath(), `File: promessa rifiutata\n${browserContext()}\n\n${r?.stack ?? ''}`).catch(() => {});
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
