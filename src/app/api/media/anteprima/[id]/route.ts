import { eq } from "drizzle-orm";
import { Readable } from "node:stream";

import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { requireClientAccess } from "@/lib/auth";
import { mediaFileInfo, mediaStream } from "@/lib/media";

// Anteprima di foto e video nell'app (serve l'accesso al cliente).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, Number((await params).id)));
  if (!m) return new Response(null, { status: 404 });
  await requireClientAccess(m.clientId);
  try {
    const { size } = await mediaFileInfo(m.storageKey);
    return new Response(Readable.toWeb(mediaStream(m.storageKey)) as ReadableStream, {
      headers: { "Content-Type": m.mime, "Content-Length": String(size), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
