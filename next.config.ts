import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacchetto autonomo (server.js + dipendenze minime) da caricare su Plesk: niente build sul server
  output: "standalone",
  poweredByHeader: false,
  // Revisione grafica: le immagini (massimo 5 MB) arrivano via Server Action
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    // Il service worker delle notifiche si aggiorna sempre (mai una versione vecchia in cache)
    const serviceWorker = { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] };
    if (process.env.NODE_ENV !== "production") return [serviceWorker];
    return [
      serviceWorker,
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
