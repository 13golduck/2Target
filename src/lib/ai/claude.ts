import "server-only";
import { integrationKey } from "@/lib/integrations/keys";
import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { aiRuns } from "@/db/schema";
import { currentJobSignal, JobCancelled } from "./jobs";
import { assertBudget, usdToBilledEur } from "./budget";

// Chiamate a Claude per il check-up: modelli per modalità, streaming, ripresa dei turni in pausa,
// registro di token e costo stimato (contatore mostrato a fine lavoro).

export type AiMode = "opus" | "sonnet" | "misto";
export type Task = "ricerca" | "domande" | "scrittura";

export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
} as const;

/** Misto: Sonnet raccoglie e fa le domande, Opus scrive il documento. */
export function modelFor(mode: AiMode, task: Task) {
  if (mode === "opus") return MODELS.opus;
  if (mode === "sonnet") return MODELS.sonnet;
  return task === "scrittura" ? MODELS.opus : MODELS.sonnet;
}

// Listino in dollari per milione di token (prezzi Anthropic, ottobre 2026) e per ricerca web.
// Scrittura in cache: 1,25× l'ingresso per 5 minuti, 2× per un'ora.
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number }> = {
  [MODELS.opus]: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, cacheWrite1h: 8 },
  [MODELS.sonnet]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, cacheWrite1h: 4 },
};
const WEB_SEARCH_USD = 10 / 1000;

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number; // scritture in cache da 5 minuti
  cacheWrite1h?: number; // scritture in cache da un'ora
  searches: number;
}

/** Costo stimato a listino in dollari (token in ingresso, uscita, cache e ricerche web). */
export function estimateCostUsd(model: string, u: Usage) {
  const p = PRICES[model];
  if (!p) return 0;
  return (
    (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite + (u.cacheWrite1h ?? 0) * p.cacheWrite1h) / 1_000_000 +
    u.searches * WEB_SEARCH_USD
  );
}

// Chiave: Impostazioni → Integrazioni (o, in riserva, la variabile ANTHROPIC_API_KEY)
export const isAiConfigured = () => !!integrationKey("anthropicApiKey");

let client: Anthropic | null = null;
let clientKey = "";
function anthropic() {
  const apiKey = integrationKey("anthropicApiKey");
  if (!apiKey) throw new Error("Chiave API di Anthropic mancante: inseriscila in Impostazioni → Integrazioni");
  // Se la chiave cambia in Impostazioni si crea un nuovo client
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey, maxRetries: 3, timeout: 15 * 60_000 });
    clientKey = apiKey;
  }
  return client;
}

export interface CallOptions {
  model: string;
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  web?: { searches: number; fetches?: number };
  effort?: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
  outputFormat?: Anthropic.Beta.BetaJSONOutputFormat;
  /** Avanzamento leggibile: query di ricerca e pagine lette. */
  onProgress?: (text: string) => void | Promise<void>;
  log: { step: string; clientId?: number; checkupId?: number };
}

export interface CallResult {
  text: string;
  sources: { url: string; title?: string }[];
  message: Anthropic.Beta.BetaMessage;
}

/**
 * Una "chiamata" logica: streaming, ripresa automatica di pause_turn (ricerche lunghe),
 * fallback lato server se il modello rifiuta, registro dei consumi.
 */
export async function callClaude(o: CallOptions): Promise<CallResult> {
  const started = Date.now();
  const messages = [...o.messages];
  const tools: Anthropic.Beta.BetaToolUnion[] = o.web
    ? [
        { type: "web_search_20260209", name: "web_search", max_uses: o.web.searches, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } },
        // Pagine lette al massimo 20k token ciascuna: il filtro dinamico tiene solo le parti utili
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: o.web.fetches ?? o.web.searches, max_content_tokens: 20_000 },
      ]
    : [];

  let final: Anthropic.Beta.BetaMessage | null = null;
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0, searches: 0, fetches: 0 };
  const texts: string[] = [];
  const sources = new Map<string, string | undefined>();

  const signal = currentJobSignal();
  for (let round = 0; round < 6; round++) {
    if (signal?.aborted) throw new JobCancelled();
    // Controllo di spesa prima di ogni richiesta (anche alla ripresa di un turno in pausa)
    await assertBudget({ clientId: o.log.clientId, checkupId: o.log.checkupId });
    const stream = anthropic().beta.messages.stream({
      model: o.model,
      max_tokens: o.maxTokens ?? 32_000,
      system: o.system,
      messages,
      ...(tools.length && { tools }),
      thinking: { type: "adaptive" },
      output_config: { effort: o.effort ?? "high", ...(o.outputFormat && { format: o.outputFormat }) },
      // Se il modello rifiuta per una regola di sicurezza, l'API riprova con il modello più adatto
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }, signal ? { signal } : undefined);

    stream.on("contentBlock", (block) => {
      if (!o.onProgress) return;
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) void o.onProgress(`Cerco: ${input.query}`);
        if (block.name === "web_fetch" && input.url) void o.onProgress(`Leggo: ${input.url}`);
      }
    });

    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      // Contesto per il registro errori: quale chiamata è fallita
      if (e && typeof e === "object") {
        (e as { aiContext?: Record<string, unknown> }).aiContext = {
          Modello: o.model,
          Passo: o.log.step,
          Giro: round + 1,
          "Output strutturato": o.outputFormat ? "sì" : "no",
          "Ricerca web": o.web ? `${o.web.searches} ricerche` : "no",
          "Max token": o.maxTokens ?? 32_000,
          Effort: o.effort ?? "high",
        };
      }
      throw e;
    }
    final = msg;
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    const cc = msg.usage.cache_creation;
    if (cc) {
      usage.cacheWrite += cc.ephemeral_5m_input_tokens ?? 0;
      usage.cacheWrite1h += cc.ephemeral_1h_input_tokens ?? 0;
    } else {
      usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
    }
    usage.searches += msg.usage.server_tool_use?.web_search_requests ?? 0;
    usage.fetches += msg.usage.server_tool_use?.web_fetch_requests ?? 0;

    for (const block of msg.content) {
      if (block.type === "text") {
        texts.push(block.text);
        for (const c of block.citations ?? []) {
          if ("url" in c && c.url) sources.set(c.url, "title" in c ? (c.title ?? undefined) : undefined);
        }
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
      }
    }

    if (msg.stop_reason === "pause_turn") {
      // Ricerca lunga: si rimanda il turno così com'è e il server riprende da dove era rimasto
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    break;
  }

  const costUsd = estimateCostUsd(PRICES[final?.model ?? ""] ? final!.model : o.model, usage);
  const costEur = await usdToBilledEur(costUsd);

  await db.insert(aiRuns).values({
    clientId: o.log.clientId,
    checkupId: o.log.checkupId,
    step: o.log.step,
    model: final?.model ?? o.model,
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite + usage.cacheWrite1h,
    webSearches: usage.searches,
    webFetches: usage.fetches,
    costUsd,
    costEur,
    durationMs: Date.now() - started,
  });

  if (!final) throw new Error("Nessuna risposta dall'AI");
  if (final.stop_reason === "refusal") throw new Error("L'AI ha rifiutato questa richiesta: riformula le informazioni e riprova.");
  if (final.stop_reason === "max_tokens") throw new Error("Risposta troppo lunga e interrotta: riprova.");
  return { text: texts.join(""), sources: [...sources].map(([url, title]) => ({ url, title })), message: final };
}
