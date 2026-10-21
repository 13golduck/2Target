// Librerie musicali dello Studio: formato comune dei brani e regole sulle licenze. Funzioni pure (tracks.test.ts).
//
// Licenze ammesse per mettere un brano sotto il video di un cliente:
// - CC0 e pubblico dominio (pdm): nessun obbligo;
// - CC BY: si può usare anche a fini commerciali, citando l'autore nel post.
// Escluse: NC (vieta l'uso commerciale), ND (vieta le opere derivate: un video con musica lo è),
// SA (obbligherebbe a rilasciare anche il video con la stessa licenza).

export const MUSIC_PROVIDERS = ["openverse", "jamendo"] as const;
export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];

export type MusicTrack = {
  provider: MusicProvider;
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  /** Anteprima da ascoltare nel browser. */
  previewUrl: string;
  /** File da scaricare per il montaggio (MP3). */
  downloadUrl: string;
  license: string;
  licenseUrl: string | null;
  /** Testo dei crediti da mettere nel post quando la licenza lo chiede. */
  credit: string;
  sourceUrl: string | null;
  source: string;
};

const USABLE = new Set(["cc0", "pdm", "by"]);

/** La licenza permette di usare il brano nel video di un cliente (anche sponsorizzato)? */
export const isUsableLicense = (license: string) => USABLE.has(license.toLowerCase());

/** Va citato l'autore nel testo del post? */
export const needsCredit = (license: string | null | undefined) => (license ?? "").toLowerCase() === "by";

/** Codice della licenza da un indirizzo Creative Commons (es. .../licenses/by-nc/3.0/ → «by-nc»). */
export function licenseFromUrl(url: string | null | undefined) {
  const m = (url ?? "").match(/creativecommons\.org\/(?:licenses|publicdomain)\/([a-z-]+)/i);
  if (!m) return "sconosciuta";
  const code = m[1].toLowerCase();
  return code === "zero" ? "cc0" : code === "mark" ? "pdm" : code;
}

/** Etichetta breve da mostrare accanto al brano. */
export function licenseLabel(license: string) {
  const l = license.toLowerCase();
  if (l === "cc0" || l === "pdm") return "Libera (CC0)";
  if (l === "by") return "CC BY · citare l'autore";
  return `CC ${l.toUpperCase()}`;
}

type OpenverseResult = {
  id: string;
  title?: string;
  creator?: string;
  url?: string;
  license?: string;
  license_url?: string;
  attribution?: string;
  foreign_landing_url?: string;
  duration?: number | null;
  source?: string;
  filetype?: string;
};

/** Risultato di Openverse → brano, o null se la licenza o il file non vanno bene per il montaggio. */
export function fromOpenverse(r: OpenverseResult): MusicTrack | null {
  const license = (r.license ?? "").toLowerCase();
  if (!r.id || !r.url || !isUsableLicense(license)) return null;
  // Il montaggio usa MP3 (o M4A): altri formati non si caricano
  if (r.filetype && !["mp3", "m4a"].includes(r.filetype.toLowerCase())) return null;
  const title = (r.title ?? "Brano senza titolo").replace(/\.(mp3|wav|ogg|flac)$/i, "");
  return {
    provider: "openverse",
    id: r.id,
    title,
    artist: r.creator ?? "Autore sconosciuto",
    durationSec: r.duration ? Math.round(r.duration / 100) / 10 : null,
    previewUrl: r.url,
    downloadUrl: r.url,
    license,
    licenseUrl: r.license_url ?? null,
    credit: r.attribution ?? `«${title}» di ${r.creator ?? "autore sconosciuto"}`,
    sourceUrl: r.foreign_landing_url ?? null,
    source: r.source ?? "openverse",
  };
}

type JamendoTrack = {
  id: string | number;
  name?: string;
  artist_name?: string;
  duration?: number;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
  shareurl?: string;
};

/** Brano di Jamendo → brano, o null se non è scaricabile o la licenza non va bene. */
export function fromJamendo(t: JamendoTrack): MusicTrack | null {
  const license = licenseFromUrl(t.license_ccurl);
  if (!t.audiodownload_allowed || !t.audiodownload || !t.audio || !isUsableLicense(license)) return null;
  const title = t.name ?? "Brano senza titolo";
  const artist = t.artist_name ?? "Autore sconosciuto";
  return {
    provider: "jamendo",
    id: String(t.id),
    title,
    artist,
    durationSec: t.duration ?? null,
    previewUrl: t.audio,
    downloadUrl: t.audiodownload,
    license,
    licenseUrl: t.license_ccurl ?? null,
    credit: `«${title}» di ${artist} (Jamendo), licenza CC ${license.toUpperCase()}${t.license_ccurl ? ` ${t.license_ccurl}` : ""}`,
    sourceUrl: t.shareurl ?? null,
    source: "jamendo",
  };
}
