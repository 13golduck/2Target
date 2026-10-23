'use client';

import { useEffect, useRef } from 'react';

// Cielo stellato su tre livelli di profondità: le stelle scorrono piano e si spostano con il mouse (o con l'inclinazione su smartphone).
// Con «riduci movimento» attivo resta un cielo fermo.

export function Starfield() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars = [];
    let raf = 0;
    const target = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 2600);
      stars = Array.from({ length: n }, () => {
        const z = Math.random();
        return { x: Math.random() * w, y: Math.random() * h, z, r: 0.4 + z * 1.4, tw: Math.random() * Math.PI * 2, gold: Math.random() < 0.08 };
      });
    };

    const draw = (t) => {
      pos.x += (target.x - pos.x) * 0.05;
      pos.y += (target.y - pos.y) * 0.05;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!still) s.x -= 0.03 + s.z * 0.12;
        if (s.x < -10) s.x = w + 10;
        const px = s.x + pos.x * (8 + s.z * 32);
        const py = s.y + pos.y * (8 + s.z * 32);
        const alpha = still ? 0.8 : 0.55 + 0.45 * Math.sin(t / 900 + s.tw);
        ctx.beginPath();
        ctx.arc(((px % w) + w) % w, ((py % h) + h) % h, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.gold ? `rgba(205,164,52,${alpha})` : `rgba(255,255,255,${alpha * (0.4 + s.z * 0.6)})`;
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };

    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * -1;
      target.y = (e.clientY / window.innerHeight - 0.5) * -1;
    };
    const onTilt = (e) => {
      if (e.gamma == null) return;
      target.x = Math.max(-1, Math.min(1, e.gamma / 30)) * -0.5;
      target.y = Math.max(-1, Math.min(1, (e.beta - 40) / 30)) * -0.5;
    };

    resize();
    draw(0);
    window.addEventListener('resize', resize);
    if (!still) {
      window.addEventListener('pointermove', onMove);
      window.addEventListener('deviceorientation', onTilt);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
