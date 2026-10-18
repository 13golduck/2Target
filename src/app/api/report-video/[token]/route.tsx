import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { ImageResponse } from "next/og";

import { ensureMediaDir, mediaPath } from "@/lib/media";
import { renderWithFfmpeg, slideshowArgs } from "@/lib/media-video";
import { monthlyReportData, reportFromToken, type MonthlyReport } from "@/lib/monthly-report";

// Video verticale del mese (1080×1920, ~15 s) da condividere nelle storie: slide con i numeri principali
// generate con next/og e montate con FFmpeg. Si rigenera al massimo una volta al giorno per cliente e mese.

export const maxDuration = 300;
export const runtime = "nodejs";

const GOLD = "#CDA434";
const INK = "#121212";
const n = (v: number) => Math.round(v).toLocaleString("it-IT");

function Slide({ kicker, big, small, dark = true }: { kicker?: string; big: string; small?: string; dark?: boolean }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 110, background: dark ? INK : "#FBF6E6", color: dark ? "#fff" : INK }}>
      <div style={{ display: "flex", background: GOLD, color: INK, fontSize: 52, fontWeight: 800, borderRadius: 18, padding: "6px 22px", alignSelf: "flex-start" }}>2T</div>
      {kicker && <div style={{ display: "flex", marginTop: 90, fontSize: 52, color: dark ? GOLD : "#9A7B1F", textTransform: "uppercase", letterSpacing: 4 }}>{kicker}</div>}
      <div style={{ display: "flex", marginTop: 40, fontSize: big.length > 14 ? 110 : 190, fontWeight: 800, lineHeight: 1.05 }}>{big}</div>
      {small && <div style={{ display: "flex", marginTop: 40, fontSize: 58, color: dark ? "#C4CDD5" : "#637381", lineHeight: 1.3 }}>{small}</div>}
    </div>
  );
}

/** Le slide del mese: solo i numeri che ci sono (niente slide a zero). */
function slides(r: MonthlyReport) {
  const out = [<Slide key="c" kicker="Il tuo mese" big={r.clientName} small={r.label} />];
  if (r.posts.length) out.push(<Slide key="p" dark={false} kicker="Contenuti pubblicati" big={String(r.posts.length)} small="post, reel e storie usciti sui tuoi profili" />);
  if (r.reach) out.push(<Slide key="r" kicker="Persone raggiunte" big={n(r.reach)} small="hanno visto i tuoi contenuti" />);
  if (r.followersGained > 0) out.push(<Slide key="f" dark={false} kicker="Nuovi follower" big={`+${n(r.followersGained)}`} small="persone in più che ti seguono" />);
  if (r.leads) out.push(<Slide key="l" kicker="Contatti ricevuti" big={String(r.leads)} small="richieste arrivate da social e sito" />);
  if (r.best?.caption) out.push(<Slide key="b" dark={false} kicker="Il post del mese" big="★" small={r.best.caption.slice(0, 120)} />);
  out.push(<Slide key="g" kicker="Grazie!" big="Avanti così" small="Golduck · il tuo team marketing" />);
  return out;
}

const g = globalThis as unknown as { __reportVideos?: Map<string, Promise<string>> };
const running = (g.__reportVideos ??= new Map());

async function render(r: MonthlyReport, file: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "2t-video-"));
  try {
    const images: string[] = [];
    for (const [i, el] of slides(r).entries()) {
      const png = Buffer.from(await new ImageResponse(el, { width: 1080, height: 1920 }).arrayBuffer());
      const f = path.join(dir, `s${i}.png`);
      await writeFile(f, png);
      images.push(f);
    }
    await renderWithFfmpeg(slideshowArgs(images, file, 2.6, 0.5));
    return file;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ref = reportFromToken((await params).token);
  if (!ref) return new Response("Link non valido o scaduto", { status: 404 });
  await ensureMediaDir();
  const today = new Date().toISOString().slice(0, 10);
  const key = `report-${ref.clientId}-${ref.month}-${today}.mp4`;
  const file = mediaPath(key);
  if (!existsSync(file)) {
    // Una sola generazione alla volta per lo stesso video (due clic, due persone)
    let job = running.get(key);
    if (!job) {
      job = monthlyReportData(ref.clientId, ref.month).then((r) => render(r, file));
      running.set(key, job);
      job.finally(() => running.delete(key)).catch(() => undefined);
    }
    try {
      await job;
    } catch (e) {
      return new Response(`Video non generato: ${e instanceof Error ? e.message : e}`, { status: 500 });
    }
  }
  const size = (await stat(file)).size;
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="riepilogo-${ref.month}.mp4"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
