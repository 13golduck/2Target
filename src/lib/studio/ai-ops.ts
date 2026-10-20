import { z } from "zod";

import { DesignSchema } from "./design";
import { STUDIO_FORMATS, type StudioOp } from "./state";

// Operazioni come le restituisce l'AI dello Studio, e conversione in operazioni vere. Funzioni pure (ai-ops.test.ts).

// La grafica viaggia come testo JSON: con lo schema completo (pagine, livelli, colori) la grammatica dell'output
// strutturato diventa troppo grande per l'API. Il server la controlla subito dopo con lo schema vero.
export const AiOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("titolo"), title: z.string().describe("Titolo interno della scheda, breve") }),
  z.object({ op: z.literal("testo"), caption: z.string().describe("Testo completo del post, senza hashtag") }),
  z.object({ op: z.literal("hashtag"), hashtags: z.string().describe("Hashtag separati da spazio, ognuno con #") }),
  z.object({ op: z.literal("formato"), format: z.enum(STUDIO_FORMATS) }),
  z.object({ op: z.literal("grafica"), designJson: z.string().describe("Grafica completa in JSON, nel formato descritto nelle istruzioni") }),
  z.object({ op: z.literal("grafica_rimuovi") }),
  z.object({
    op: z.literal("immagine"),
    prompt: z.string().describe("Descrizione dettagliata dell'immagine da creare o della modifica da fare, in inglese"),
    referenceMediaIds: z.array(z.number().int()).describe("Foto del materiale da modificare o da usare come riferimento (vuoto = immagine nuova)"),
    page: z.number().int().describe("Pagina della grafica in cui metterla come sfondo (1 = prima); 0 = solo nel materiale"),
  }),
]);

/** Richiesta di immagine AI: si esegue sul server dopo le altre modifiche. */
export type ImageRequestOp = { prompt: string; referenceMediaIds: number[]; page: number };

/** Immagini per turno: ognuna costa, e più di due in una risposta sono quasi sempre un eccesso. */
export const MAX_IMAGES_PER_TURN = 2;

/** Formato della grafica spiegato all'AI (lo schema vero è DesignSchema). */
export const DESIGN_FORMAT = `{ "size": "quadrato" | "verticale" | "storia",
  "pages": [ { "id": "p1", "background": "#RRGGBB", "layers": [ livello, ... ] } ]  // da 1 a 10 pagine
}
Ogni livello ha: "id" (es. "l1"), "x", "y", "width", "height" (pixel), "rotation" (gradi), "opacity" (0-1) e "type":
- "testo": "text", "fontFamily", "fontSize" (px), "bold" (true/false), "color" "#RRGGBB", "align" "left"|"center"|"right", "background" "#RRGGBB" o null
- "immagine": "mediaId" (id di una foto del materiale), "fit" "riempi"|"contieni"
- "logo": nessun campo in più
- "forma": "shape" "rettangolo"|"cerchio", "fill" "#RRGGBB", "radius" (angoli arrotondati, px)
I livelli si disegnano nell'ordine: il primo sta sotto.`;

/** Dall'output dell'AI alle operazioni vere; una grafica non valida si scarta e lo si dice nella risposta. */
export function toStudioOps(ops: z.infer<typeof AiOpSchema>[]): { ops: StudioOp[]; images: ImageRequestOp[]; rejected: boolean } {
  let rejected = false;
  const out: StudioOp[] = [];
  const images: ImageRequestOp[] = [];
  for (const o of ops) {
    if (o.op === "immagine") {
      // Al massimo 3 riferimenti: bastano per un prodotto o un ambiente e tengono basso il costo
      images.push({ prompt: o.prompt.trim(), referenceMediaIds: [...new Set(o.referenceMediaIds)].slice(0, 3), page: Math.max(0, o.page) });
      continue;
    }
    if (o.op !== "grafica") {
      out.push(o);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(o.designJson);
    } catch {
      parsed = null;
    }
    const design = DesignSchema.safeParse(parsed);
    if (design.success) out.push({ op: "grafica", design: design.data });
    else rejected = true;
  }
  return { ops: out, images: images.filter((i) => i.prompt).slice(0, MAX_IMAGES_PER_TURN), rejected };
}
