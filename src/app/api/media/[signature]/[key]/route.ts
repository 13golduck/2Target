import { Readable } from "node:stream";

import { mediaFileInfo, mediaStream, verifyMediaSignature } from "@/lib/media";

// Indirizzo pubblico firmato da cui Meta scarica foto e video da pubblicare. Senza firma valida: 404.

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime" };

export async function GET(request: Request, { params }: { params: Promise<{ signature: string; key: string }> }) {
  const { signature, key } = await params;
  if (!/^[\w-]+\.(jpg|png|mp4|mov)$/.test(key) || !verifyMediaSignature(key, signature)) return new Response(null, { status: 404 });
  let size: number;
  try {
    size = (await mediaFileInfo(key)).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const type = TYPES[key.split(".").pop()!];
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  // I video si scaricano anche a pezzi (Range)
  const m = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(Readable.toWeb(mediaStream(key, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(Readable.toWeb(mediaStream(key)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
