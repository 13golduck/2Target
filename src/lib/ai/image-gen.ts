import "server-only";

import { db } from "@/db";
import { aiRuns } from "@/db/schema";
import { integrationKey } from "@/lib/integrations/keys";
import { geminiImageFrom, geminiTextFrom, imageDimensions, type AspectRatio } from "@/lib/studio/image-tools";
import { assertBudget, IMAGE_STEP_PREFIX, usdToBilledEur } from "./budget";

// Immagini create o modificate dall'AI per lo Studio. Più fornitori possibili dietro la stessa interfaccia:
// per ora Google (Gemini), scelto perché modifica anche le foto del cliente oltre a crearne di nuove.
// Ogni immagine passa dal tetto di spesa delle immagini e si registra in Consumi AI.

export type ReferenceImage = { mime: "image/jpeg" | "image/png"; base64: string };

export type ImageRequest = {
  clientId: number;
  prompt: string;
  aspectRatio: AspectRatio;
  /** Foto da modificare o da usare come riferimento (prodotto, persona, ambiente). */
  references: ReferenceImage[];
};

export type GeneratedImage = { bytes: Buffer; mime: "image/jpeg" | "image/png"; width: number | null; height: number | null; model: string; costEur: number };

export class ImageGenError extends Error {}

interface ImageProvider {
  id: string;
  label: string;
  configured(): boolean;
  generate(req: ImageRequest): Promise<Omit<GeneratedImage, "costEur"> & { costUsd: number }>;
}

// ── Google (API Interactions di Gemini) ──────────────────────────────

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_DEFAULT_MODEL = "gemini-nano-banana-2.1";
const GEMINI_TIMEOUT_MS = 120_000;
// Listino Google (ottobre 2026), dollari per immagine 2K in uscita; le foto in ingresso costano circa 0,001 $ l'una
const GEMINI_PRICE_USD: Record<string, number> = { "gemini-nano-banana-2.1": 0.0504, "gemini-3.1-flash-lite-image": 0.0336, "gemini-3-pro-image": 0.134 };
const GEMINI_INPUT_IMAGE_USD = 0.0011;
const GEMINI_FALLBACK_PRICE_USD = 0.134; // modello non in tabella: si stima col più caro, per prudenza

const geminiModel = () => integrationKey("geminiImageModel") || GEMINI_DEFAULT_MODEL;

const google: ImageProvider = {
  id: "google",
  label: "Google Gemini",
  configured: () => !!integrationKey("geminiApiKey"),
  async generate(req) {
    const model = geminiModel();
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": integrationKey("geminiApiKey"), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ type: "text", text: req.prompt }, ...req.references.map((r) => ({ type: "image", mime_type: r.mime, data: r.base64 }))],
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: req.aspectRatio, image_size: model.includes("flash-lite") ? "1K" : "2K" },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `errore ${res.status}`;
      throw new ImageGenError(res.status === 401 || res.status === 403 ? "Google ha rifiutato la chiave API: controllala in Impostazioni → Integrazioni" : `Google: ${message}`);
    }
    const image = geminiImageFrom(body);
    if (!image) {
      const said = geminiTextFrom(body);
      throw new ImageGenError(said ? `Google non ha creato l'immagine: ${said}` : "Google non ha restituito un'immagine: riformula la richiesta");
    }
    const bytes = Buffer.from(image.base64, "base64");
    const mime = image.mime === "image/png" ? "image/png" : "image/jpeg";
    const size = imageDimensions(bytes);
    const costUsd = (GEMINI_PRICE_USD[model] ?? GEMINI_FALLBACK_PRICE_USD) + req.references.length * GEMINI_INPUT_IMAGE_USD;
    return { bytes, mime, width: size?.width ?? null, height: size?.height ?? null, model, costUsd };
  },
};

const PROVIDERS: ImageProvider[] = [google];

/** Primo fornitore con la chiave inserita (null = immagini AI non disponibili). */
export const imageProvider = () => PROVIDERS.find((p) => p.configured()) ?? null;
export const isImageAiConfigured = () => !!imageProvider();

/** Crea o modifica un'immagine: controlla il tetto, chiama il fornitore, registra il costo. */
export async function generateImage(req: ImageRequest): Promise<GeneratedImage> {
  const provider = imageProvider();
  if (!provider) throw new ImageGenError("Le immagini AI non sono configurate: un amministratore inserisce la chiave Google AI in Impostazioni → Integrazioni");
  // Stima prudente prima della chiamata: il listino del modello più caro
  await assertBudget({ clientId: req.clientId, estimateUsd: GEMINI_FALLBACK_PRICE_USD, images: true });
  const started = Date.now();
  const out = await provider.generate(req);
  const costEur = await usdToBilledEur(out.costUsd);
  await db.insert(aiRuns).values({
    clientId: req.clientId,
    step: `${IMAGE_STEP_PREFIX}: ${req.references.length ? "modifica" : "nuova"}`,
    model: out.model.slice(0, 60),
    costUsd: out.costUsd,
    costEur,
    durationMs: Date.now() - started,
  });
  return { bytes: out.bytes, mime: out.mime, width: out.width, height: out.height, model: out.model, costEur };
}
