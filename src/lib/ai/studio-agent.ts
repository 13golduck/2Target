import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { platformName } from "@/lib/platforms";
import { AiOpSchema, DESIGN_FORMAT, MAX_IMAGES_PER_TURN, toStudioOps, type ImageRequestOp } from "@/lib/studio/ai-ops";
import { DESIGN_FONTS, DESIGN_SIZES, type BrandColors } from "@/lib/studio/design";
import type { StudioOp, StudioState } from "@/lib/studio/state";
import { assertBudget } from "./budget";
import { callClaude, MODELS } from "./claude";
import { clientContext } from "./designer";

// 2Target Studio: l'AI legge la richiesta e il progetto com'è adesso e risponde con le modifiche da fare
// (operazioni), non con un file finito. Chi lavora vede le modifiche come nuova versione e può correggerle.

const TurnSchema = z.object({
  reply: z.string().describe("Risposta breve a chi lavora, in italiano: cosa hai fatto o cosa ti serve sapere. Massimo 3 frasi"),
  summary: z.string().describe("Riassunto della versione in massimo 8 parole, es. «Testo più breve, aggiunto invito»"),
  ops: z.array(AiOpSchema).describe("Modifiche al progetto, in ordine. Vuoto se servono chiarimenti"),
});
export type StudioTurn = { reply: string; summary: string; ops: StudioOp[]; images: ImageRequestOp[] };




export type StudioTurnInput = {
  clientId: number;
  state: StudioState;
  request: string;
  /** Ultimi messaggi della chat, dal più vecchio. */
  history: { role: "utente" | "ai"; text: string }[];
  platforms: string[];
  media: { id: number; kind: "image" | "video" | "audio"; inPost: boolean; fileName: string; width: number | null; height: number | null; durationSec: number | null }[];
  brand: { colors: BrandColors; hasLogo: boolean };
  /** Le immagini AI sono configurate (chiave Google inserita). */
  imagesAvailable: boolean;
};

// Stima prudente di un turno (Sonnet, contesto del cliente in cache): serve solo al controllo di spesa
const TURN_ESTIMATE_USD = 0.08;
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
- Il montaggio video non è ancora disponibile nello Studio: se lo chiedono, dillo e prepara intanto testo e grafica.

Grafica (operazione «grafica», sostituisce l'intera grafica; «grafica_rimuovi» la toglie):
- Creala quando la chiedono, per un carosello di slide con testo, o quando non ci sono foto e il post ne ha bisogno.
  Se il consulente ha caricato foto pronte e chiede solo il testo, non creare una grafica.
- Misure: ${Object.entries(DESIGN_SIZES).map(([k, v]) => `«${k}» ${v.width}×${v.height}`).join(", ")}. Coordinate in pixel della misura finale, origine in alto a sinistra.
- Margini almeno 8% della larghezza; testi dentro i margini; corpo minimo 40 px per il testo, 70 px o più per i titoli.
  Una riga contiene circa larghezza/(corpo×0,55) caratteri: dimensiona l'altezza del riquadro di testo di conseguenza.
- Font disponibili: ${DESIGN_FONTS.join(", ")}. Al massimo due font per grafica.
- Usa i colori del cliente indicati in <brand>; contrasto forte tra testo e sfondo (se il testo sta su una foto, dagli un riquadro "background").
- Foto: livello «immagine» con il mediaId di una foto del materiale (solo id elencati). Per una foto di sfondo a tutta pagina usa fit «riempi» e mettila come primo livello.
- Logo: livello «logo» (solo se <brand> dice che il logo c'è), piccolo, in un angolo.
- Pochi livelli, gerarchia chiara: un messaggio per slide. Mantieni gli id dei livelli che non cambi.

Immagini AI (operazione «immagine»): solo se <immagini_ai> dice che sono disponibili, e solo se la richiesta lo giustifica
(ogni immagine costa). Con referenceMediaIds modifichi una foto del cliente (cambia sfondo, luce, ambientazione, togli elementi)
mantenendo fedele il prodotto o la persona; senza riferimenti crei un'immagine nuova. Il prompt va in inglese, preciso:
soggetto, ambientazione, luce, stile fotografico, inquadratura; mai testo dentro l'immagine (i testi stanno nei livelli della grafica).
Con page > 0 l'immagine diventa lo sfondo di quella pagina della grafica: crea o aggiorna prima la grafica nello stesso turno.
Massimo ${MAX_IMAGES_PER_TURN} immagini per risposta.

Formato JSON della grafica (campo designJson):
${DESIGN_FORMAT}`;

function describeMedia(media: StudioTurnInput["media"]) {
  if (!media.length) return "Nessun file caricato.";
  return media
    .map((m, i) => {
      const size = m.width && m.height ? ` ${m.width}×${m.height}` : "";
      const len = m.durationSec ? `, ${Math.round(m.durationSec)} s` : "";
      return `${i + 1}. id ${m.id} · ${m.kind === "video" ? "Video" : m.kind === "audio" ? "Audio (musica)" : "Foto"} «${m.fileName}»${size}${len} · ${m.inPost ? "nel post" : "materiale"}`;
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
    maxTokens: 12_000,
    outputFormat: betaZodOutputFormat(TurnSchema),
    messages: [
      {
        role: "user",
        content: [
          `<progetto>\n${JSON.stringify(o.state, null, 2)}\n</progetto>`,
          `<piattaforme>${where}</piattaforme>`,
          `<materiale>\n${describeMedia(o.media)}\n</materiale>`,
          `<immagini_ai>${o.imagesAvailable ? "Disponibili." : "Non disponibili: non usare l'operazione «immagine»; se le chiedono, spiega che un amministratore deve inserire la chiave Google AI."}</immagini_ai>`,
          `<brand>Colori: sfondo ${o.brand.colors.background}, testo ${o.brand.colors.text}, accento ${o.brand.colors.accent}. Logo: ${o.brand.hasLogo ? "c'è" : "non c'è"}.</brand>`,
          history && `<chat_precedente>\n${history}\n</chat_precedente>`,
          `<richiesta>\n${o.request}\n</richiesta>`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    log: { step: "Studio: turno", clientId: o.clientId },
  });
  const turn = TurnSchema.parse(JSON.parse(r.text));
  const { ops, images, rejected } = toStudioOps(turn.ops);
  const reply = rejected ? `${turn.reply}\n\n(La grafica che ho preparato non era valida e non l'ho applicata: chiedimela di nuovo.)` : turn.reply;
  return { reply, summary: turn.summary, ops, images: o.imagesAvailable ? images : [], costEur: r.costEur };
}
