import { eq } from "drizzle-orm";

import { db } from "@/db";
import { brandKits } from "@/db/schema";
import { requireClientAccess } from "@/lib/auth";

// Logo del cliente (dal brand kit) servito come immagine: lo usano la barra laterale e l'elenco clienti.
// Il logo è salvato come data URL; qui diventa un file vero, con cache lunga (l'indirizzo cambia a ogni modifica: ?v=).

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const clientId = Number((await params).clientId);
  if (!Number.isInteger(clientId)) return new Response(null, { status: 404 });
  await requireClientAccess(clientId);
  const [kit] = await db.select({ logo: brandKits.logo }).from(brandKits).where(eq(brandKits.clientId, clientId));
  const m = kit?.logo?.match(/^data:(image\/(?:png|jpeg|svg\+xml|webp));base64,(.+)$/);
  if (!m) return new Response(null, { status: 404 });
  const versioned = new URL(request.url).searchParams.has("v");
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, max-age=300",
      // Gli SVG caricati non devono poter eseguire script
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
