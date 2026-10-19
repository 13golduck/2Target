import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { platformName } from "@/lib/platforms";
import { assertBudget } from "./budget";
import { callClaude, MODELS } from "./claude";
import { clientContext } from "./designer";

// Testo del post scritto dall'AI per «Crea post»: dall'idea del consulente (anche due parole) a un testo pronto,
// nel tono del cliente. Il consulente lo rilegge e lo corregge prima di programmare.

const CaptionSchema = z.object({
  caption: z.string().describe("Testo del post, in italiano, con a capo dove servono; senza hashtag"),
  hashtags: z.string().describe("Da 3 a 8 hashtag pertinenti separati da spazio, ognuno con #"),
});

export type DraftCaption = z.infer<typeof CaptionSchema>;

export async function draftCaption(o: { clientId: number; idea: string; platforms: string[]; format: string }): Promise<DraftCaption> {
  await assertBudget({ clientId: o.clientId, estimateUsd: 0.05 });
  const ctx = await clientContext(o.clientId);
  const where = o.platforms.length ? o.platforms.map(platformName).join(", ") : "Instagram";
  const r = await callClaude({
    model: MODELS.sonnet,
    system: [
      {
        type: "text",
        text: `Sei il social media manager di Golduck. Scrivi post per i clienti nel loro tono di voce, in italiano naturale,
concreti e senza frasi fatte. Prima riga che aggancia, poi il valore per chi legge, poi un invito all'azione chiaro.
Lunghezza adatta alle piattaforme indicate (LinkedIn più articolato, Instagram e Facebook più brevi, Threads massimo 500 caratteri).
Non inventare prezzi, date, promozioni o dati che non sono nell'idea o nel contesto. Emoji con misura, solo se adatte al brand.`,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    effort: "low",
    maxTokens: 2_000,
    outputFormat: betaZodOutputFormat(CaptionSchema),
    messages: [{ role: "user", content: `${ctx.text}\n\n<post>\nPiattaforme: ${where}\nFormato: ${o.format}\nIdea del consulente: ${o.idea}\n</post>\n\nScrivi il testo del post.` }],
    log: { step: "Crea post: testo", clientId: o.clientId },
  });
  return CaptionSchema.parse(JSON.parse(r.text));
}
