import { z } from "zod";

// 2Target Studio: il progetto di un post è uno «stato» (testo, hashtag, formato, titolo; poi grafica e video).
// L'AI e chi lavora lo cambiano con le stesse operazioni, e ogni cambio salvato è una versione.
// Funzioni pure: nessun accesso al database, testate in state.test.ts.

export const STUDIO_FORMATS = ["post", "carosello", "reel", "storia"] as const;
export type StudioFormat = (typeof STUDIO_FORMATS)[number];

export const LIMITS = { title: 120, caption: 5000, hashtags: 1000 } as const;

export const StudioStateSchema = z.object({
  title: z.string().max(LIMITS.title),
  caption: z.string().max(LIMITS.caption),
  hashtags: z.string().max(LIMITS.hashtags),
  format: z.enum(STUDIO_FORMATS),
});
export type StudioState = z.infer<typeof StudioStateSchema>;

export const EMPTY_STATE: StudioState = { title: "Nuovo post", caption: "", hashtags: "", format: "post" };

/** Operazioni sul progetto. I nomi sono quelli che l'AI usa nella risposta strutturata. */
export const StudioOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("titolo"), title: z.string().describe("Titolo interno della scheda, breve") }),
  z.object({ op: z.literal("testo"), caption: z.string().describe("Testo completo del post, senza hashtag") }),
  z.object({ op: z.literal("hashtag"), hashtags: z.string().describe("Hashtag separati da spazio, ognuno con #") }),
  z.object({ op: z.literal("formato"), format: z.enum(STUDIO_FORMATS) }),
]);
export type StudioOp = z.infer<typeof StudioOpSchema>;

/** Hashtag puliti: uno spazio tra l'uno e l'altro, ognuno con il suo #, senza doppioni. */
export function normalizeHashtags(raw: string) {
  const tags = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
  return [...new Set(tags)].join(" ");
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/** Applica le operazioni in ordine e restituisce un nuovo stato (quello passato non cambia). */
export function applyOps(state: StudioState, ops: StudioOp[]): StudioState {
  return ops.reduce<StudioState>((s, o) => {
    switch (o.op) {
      case "titolo":
        return { ...s, title: clip(o.title.trim(), LIMITS.title) || s.title };
      case "testo":
        return { ...s, caption: clip(o.caption.trim(), LIMITS.caption) };
      case "hashtag":
        return { ...s, hashtags: clip(normalizeHashtags(o.hashtags), LIMITS.hashtags) };
      case "formato":
        return { ...s, format: o.format };
    }
  }, state);
}

const LABELS: Record<StudioOp["op"], string> = { titolo: "titolo", testo: "testo", hashtag: "hashtag", formato: "formato" };

/** Riassunto di una versione quando chi l'ha fatta non ne ha scritto uno: «Cambiati testo e hashtag». */
export function describeChanges(before: StudioState, after: StudioState) {
  const changed = (["title", "caption", "hashtags", "format"] as const).filter((k) => before[k] !== after[k]);
  const names = changed.map((k) => ({ title: LABELS.titolo, caption: LABELS.testo, hashtags: LABELS.hashtag, format: LABELS.formato })[k]);
  if (!names.length) return "Nessuna modifica";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
  return `${names.length === 1 ? "Cambiato" : "Cambiati"} ${list}`;
}

/** Stato iniziale da una scheda esistente (formati non previsti dallo Studio diventano «post»). */
export function stateFromItem(item: { title: string; caption: string | null; hashtags: string | null; format: string }): StudioState {
  return {
    title: item.title,
    caption: item.caption ?? "",
    hashtags: item.hashtags ?? "",
    format: (STUDIO_FORMATS as readonly string[]).includes(item.format) ? (item.format as StudioFormat) : "post",
  };
}
