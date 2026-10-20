import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { platformName } from "@/lib/platforms";
import { StudioOpSchema, type StudioState } from "@/lib/studio/state";
import { assertBudget } from "./budget";
import { callClaude, MODELS } from "./claude";
import { clientContext } from "./designer";

// 2Target Studio: l'AI legge la richiesta e il progetto com'è adesso e risponde con le modifiche da fare
// (operazioni), non con un file finito. Chi lavora vede le modifiche come nuova versione e può correggerle.

const TurnSchema = z.object({
  reply: z.string().describe("Risposta breve a chi lavora, in italiano: cosa hai fatto o cosa ti serve sapere. Massimo 3 frasi"),
  summary: z.string().describe("Riassunto della versione in massimo 8 parole, es. «Testo più breve, aggiunto invito»"),
  ops: z.array(StudioOpSchema).describe("Modifiche al progetto, in ordine. Vuoto se servono chiarimenti"),
});
export type StudioTurn = z.infer<typeof TurnSchema>;

export type StudioTurnInput = {
  clientId: number;
  state: StudioState;
  request: string;
  /** Ultimi messaggi della chat, dal più vecchio. */
  history: { role: "utente" | "ai"; text: string }[];
  platforms: string[];
  media: { kind: "image" | "video"; fileName: string; width: number | null; height: number | null; durationSec: number | null }[];
};

// Stima prudente di un turno (Sonnet, contesto del cliente in cache): serve solo al controllo di spesa
const TURN_ESTIMATE_USD = 0.06;
const HISTORY_TURNS = 12;

const SYSTEM = `Sei il social media manager e copywriter di Golduck dentro 2Target Studio.
Lavori a quattro mani con un consulente: lui chiede, tu modifichi il progetto del post con le operazioni disponibili,
lui rilegge e corregge. Rispondi sempre con un oggetto JSON conforme allo schema.

Regole:
- Modifica solo ciò che la richiesta tocca: se chiede «accorcia il testo», non cambiare hashtag o formato.
- Alla prima richiesta prepara il post completo: titolo interno, testo, hashtag e formato adatto al materiale
  (un video → reel; più foto → carosello; altrimenti post).
- Testo in italiano naturale, nel tono di voce del cliente: prima riga che aggancia, poi il valore, poi un invito chiaro.
  Lunghezza adatta alle piattaforme (LinkedIn più articolato, Instagram e Facebook più brevi, Threads massimo 500 caratteri).
- Non inventare prezzi, date, promozioni o dati che non sono nella richiesta, nella chat o nel contesto del cliente.
- Se la richiesta è ambigua o mancano dati indispensabili, non fare operazioni: chiedi in una frase cosa ti serve.
- Grafica e montaggio video non sono ancora disponibili nello Studio: se li chiedono, dillo e prepara intanto il testo.`;

function describeMedia(media: StudioTurnInput["media"]) {
  if (!media.length) return "Nessun file caricato.";
  return media
    .map((m, i) => {
      const size = m.width && m.height ? ` ${m.width}×${m.height}` : "";
      const len = m.durationSec ? `, ${Math.round(m.durationSec)} s` : "";
      return `${i + 1}. ${m.kind === "video" ? "Video" : "Foto"} «${m.fileName}»${size}${len}`;
    })
    .join("\n");
}

/** Un turno della chat: modifiche proposte dall'AI e costo in euro. Lancia BudgetError se il tetto è raggiunto. */
export async function studioTurn(o: StudioTurnInput): Promise<StudioTurn & { costEur: number }> {
  await assertBudget({ clientId: o.clientId, estimateUsd: TURN_ESTIMATE_USD });
  const ctx = await clientContext(o.clientId);
  const where = o.platforms.length ? o.platforms.map(platformName).join(", ") : "Instagram";
  const history = o.history.slice(-HISTORY_TURNS).map((m) => `${m.role === "utente" ? "Consulente" : "Tu"}: ${m.text}`).join("\n");

  const r = await callClaude({
    model: MODELS.sonnet,
    system: [
      { type: "text", text: SYSTEM },
      // Il contesto del cliente cambia di rado: in cache per tutta la sessione di lavoro
      { type: "text", text: ctx.text, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    effort: "low",
    maxTokens: 4_000,
    outputFormat: betaZodOutputFormat(TurnSchema),
    messages: [
      {
        role: "user",
        content: [
          `<progetto>\n${JSON.stringify(o.state, null, 2)}\n</progetto>`,
          `<piattaforme>${where}</piattaforme>`,
          `<materiale>\n${describeMedia(o.media)}\n</materiale>`,
          history && `<chat_precedente>\n${history}\n</chat_precedente>`,
          `<richiesta>\n${o.request}\n</richiesta>`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    log: { step: "Studio: turno", clientId: o.clientId },
  });
  return { ...TurnSchema.parse(JSON.parse(r.text)), costEur: r.costEur };
}
