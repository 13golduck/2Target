import "server-only";

import { integrationKey } from "@/lib/integrations/keys";
import { fromJamendo, fromOpenverse, type MusicProvider, type MusicTrack } from "./tracks";

// Ricerca e download dalle librerie musicali. Il browser riceve solo i risultati; il file si scarica sul server
// rileggendo il brano dalla libreria (mai da un indirizzo mandato dal browser).

const OPENVERSE = "https://api.openverse.org/v1/audio/";
const JAMENDO = "https://api.jamendo.com/v3.0/tracks/";
const PAGE_SIZE = 20;
const TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;
// Sotto questa durata sono effetti sonori, non brani da sottofondo
const MIN_TRACK_SEC = 15;
// Solo licenze adatte ai clienti (vedi tracks.ts); Openverse le filtra già nella ricerca
const OPENVERSE_LICENSES = "cc0,pdm,by";

export class MusicLibraryError extends Error {}

export function availableProviders(): { id: MusicProvider; label: string; ready: boolean; hint?: string }[] {
  return [
    { id: "openverse", label: "Openverse", ready: true },
    { id: "jamendo", label: "Jamendo", ready: !!integrationKey("jamendoClientId"), hint: "Serve il client ID in Impostazioni → Integrazioni → Musica" },
  ];
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (res.status === 429) throw new MusicLibraryError("Troppe ricerche in poco tempo: riprova tra un minuto");
  if (!res.ok) throw new MusicLibraryError(`La libreria non risponde (errore ${res.status}): riprova tra poco`);
  return res.json();
}

/** Ricerca: solo brani con licenza utilizzabile e file adatto al montaggio. */
export async function searchTracks(provider: MusicProvider, query: string, page: number): Promise<MusicTrack[]> {
  if (provider === "openverse") {
    // Senza il filtro «music»: i brani con licenza adatta stanno soprattutto su Freesound, non categorizzati
    const q = new URLSearchParams({ q: query, license: OPENVERSE_LICENSES, page_size: String(PAGE_SIZE), page: String(page) });
    const body = (await getJson(`${OPENVERSE}?${q}`)) as { results?: unknown[] };
    return (body.results ?? [])
      .map((r) => fromOpenverse(r as Parameters<typeof fromOpenverse>[0]))
      .filter((t): t is MusicTrack => !!t && (t.durationSec ?? 0) >= MIN_TRACK_SEC);
  }
  const clientId = integrationKey("jamendoClientId");
  if (!clientId) throw new MusicLibraryError("Jamendo non è configurato: un amministratore inserisce il client ID in Impostazioni → Integrazioni → Musica");
  const q = new URLSearchParams({ client_id: clientId, format: "json", search: query, include: "licenses", audioformat: "mp32", audiodlformat: "mp32", limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  const body = (await getJson(`${JAMENDO}?${q}`)) as { results?: unknown[]; headers?: { status?: string; error_message?: string } };
  if (body.headers?.status === "failed") throw new MusicLibraryError(`Jamendo: ${body.headers.error_message ?? "richiesta rifiutata"}`);
  return (body.results ?? []).map((t) => fromJamendo(t as Parameters<typeof fromJamendo>[0])).filter((t): t is MusicTrack => !!t);
}

/** Rilegge un brano dalla libreria per id (per scaricarlo con i dati ufficiali, non quelli del browser). */
export async function trackById(provider: MusicProvider, id: string): Promise<MusicTrack> {
  let track: MusicTrack | null = null;
  if (provider === "openverse") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new MusicLibraryError("Brano non valido");
    track = fromOpenverse((await getJson(`${OPENVERSE}${id}/`)) as Parameters<typeof fromOpenverse>[0]);
  } else {
    if (!/^\d+$/.test(id)) throw new MusicLibraryError("Brano non valido");
    const q = new URLSearchParams({ client_id: integrationKey("jamendoClientId"), format: "json", id, include: "licenses", audioformat: "mp32", audiodlformat: "mp32" });
    const body = (await getJson(`${JAMENDO}?${q}`)) as { results?: unknown[] };
    track = body.results?.[0] ? fromJamendo(body.results[0] as Parameters<typeof fromJamendo>[0]) : null;
  }
  if (!track) throw new MusicLibraryError("Questo brano non si può usare per i clienti (licenza o download non consentiti)");
  return track;
}

/** Scarica il file del brano (MP3), con un limite di dimensione. */
export async function downloadTrack(track: MusicTrack): Promise<Buffer> {
  const res = await fetch(track.downloadUrl, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
  if (!res.ok || !res.body) throw new MusicLibraryError(`Download non riuscito (errore ${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > MAX_DOWNLOAD_BYTES) throw new MusicLibraryError("Brano troppo pesante (massimo 30 MB)");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD_BYTES) throw new MusicLibraryError("Brano troppo pesante (massimo 30 MB)");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  // Un MP3 inizia con un'intestazione ID3 o con un sincronismo di fotogramma: niente pagine HTML o file estranei
  const isMp3 = bytes.subarray(0, 3).toString("latin1") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (!isMp3) throw new MusicLibraryError("Il file scaricato non è un MP3");
  return bytes;
}
