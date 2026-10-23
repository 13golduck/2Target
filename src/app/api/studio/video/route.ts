import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { editorialItems, mediaAssets } from "@/db/schema";
import { requireClientAccess, requireWriter } from "@/lib/auth";
import { featureOn } from "@/lib/features-data";
import { imageDimensions } from "@/lib/studio/image-tools";
import { currentVersion, mediaOf } from "@/lib/studio/studio-data";
import { sanitizeVideo, VIDEO_SIZES } from "@/lib/studio/video";
import { startVideoRender } from "@/lib/studio/video-render";

// Esportazione del montaggio dello Studio: il browser manda solo le immagini delle scritte (una per scritta,
// campo overlay_<id>); il montaggio si legge dalla versione salvata, così si compone ciò che si vede nello Studio.
//   POST /api/studio/video?scheda=<id>   multipart: tag, overlay_<id della scritta> (PNG a piena misura)

const MAX_OVERLAY_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

export async function POST(request: Request) {
  const me = await requireWriter();
  const itemId = Number(new URL(request.url).searchParams.get("scheda"));
  const [item] = await db.select({ id: editorialItems.id, clientId: editorialItems.clientId }).from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) return Response.json({ error: "Scheda non trovata" }, { status: 404 });
  await requireClientAccess(item.clientId);
  if (!(await featureOn("studio", item.clientId))) return Response.json({ error: "Lo Studio è spento per questo cliente" }, { status: 403 });

  const busy = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(and(eq(mediaAssets.itemId, itemId), eq(mediaAssets.origin, "video"), eq(mediaAssets.processState, "in_lavorazione")));
  if (busy.length) return Response.json({ error: "C'è già un montaggio in corso: aspetta che finisca" }, { status: 409 });

  const { state } = await currentVersion(itemId);
  const edit = state.video ? sanitizeVideo(state.video, await mediaOf(itemId)) : null;
  if (!edit) return Response.json({ error: "Nessun montaggio salvato: aggiungi almeno una clip e salva" }, { status: 400 });

  const form = await request.formData();
  const { width, height } = VIDEO_SIZES[edit.size];
  const overlays: Buffer[] = [];
  for (const t of edit.texts) {
    const file = form.get(`overlay_${t.id}`);
    if (!(file instanceof File)) return Response.json({ error: `Manca l'immagine della scritta «${t.text}»: riprova l'esportazione` }, { status: 400 });
    if (file.size > MAX_OVERLAY_BYTES) return Response.json({ error: "Immagine di una scritta troppo pesante" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = imageDimensions(bytes);
    // Solo PNG trasparenti della misura del video: niente file arbitrari passati a FFmpeg
    if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b) || size?.width !== width || size?.height !== height) {
      return Response.json({ error: "Immagine di una scritta non valida: riprova l'esportazione" }, { status: 400 });
    }
    overlays.push(Buffer.from(bytes));
  }
  const tag = String(form.get("tag") ?? "").replace(/[^0-9a-f]/g, "").slice(0, 8) || "senza";

  try {
    const mediaId = await startVideoRender({ itemId, clientId: item.clientId, userId: me.id, edit, overlays, tag });
    return Response.json({ ok: true, mediaId });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Montaggio non avviato" }, { status: 400 });
  }
}
