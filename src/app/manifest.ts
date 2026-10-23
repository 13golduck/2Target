import type { MetadataRoute } from "next";

// App installabile sul telefono (schermata Home): serve anche per le notifiche su iPhone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "2Target",
    short_name: "2Target",
    description: "Marketing dei clienti Golduck: piani, pubblicazioni, lead e risultati",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#CDA434",
    lang: "it",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
