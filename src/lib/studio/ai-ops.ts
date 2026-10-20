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
]);

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
export function toStudioOps(ops: z.infer<typeof AiOpSchema>[]): { ops: StudioOp[]; rejected: boolean } {
  let rejected = false;
  const out: StudioOp[] = [];
  for (const o of ops) {
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
  return { ops: out, rejected };
}
