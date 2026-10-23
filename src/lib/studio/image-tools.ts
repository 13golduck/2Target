// Immagini AI dello Studio: funzioni pure condivise dai fornitori (testate in image-tools.test.ts).

import type { DesignSize } from "./design";

export const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9", "3:4", "4:3"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Proporzione dell'immagine per una misura della grafica. */
export const aspectForSize = (size: DesignSize): AspectRatio => ({ quadrato: "1:1", verticale: "4:5", storia: "9:16" })[size] as AspectRatio;

/** Larghezza e altezza lette dall'intestazione di un PNG o di un JPEG (null se il formato non è riconosciuto). */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: firma di 8 byte, poi il blocco IHDR con larghezza e altezza a 32 bit
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: si scorrono i segmenti fino a un SOFn (0xC0–0xCF esclusi DHT, JPG e DAC)
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + length;
    }
  }
  return null;
}

type GeminiBlock = { type?: string; data?: string; mime_type?: string; mimeType?: string };
type GeminiInteraction = { steps?: { type?: string; content?: GeminiBlock[] }[]; output_image?: GeminiBlock; error?: { message?: string } };

/**
 * Ultima immagine nella risposta dell'API Interactions di Gemini (base64 e tipo), o null se non c'è.
 * Si cerca prima nei passi «model_output», poi nella scorciatoia output_image.
 */
export function geminiImageFrom(response: unknown): { base64: string; mime: string } | null {
  const r = (response ?? {}) as GeminiInteraction;
  const blocks = (r.steps ?? []).filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []);
  const image = [...blocks].reverse().find((b) => b.type === "image" && b.data) ?? (r.output_image?.data ? r.output_image : null);
  if (!image?.data) return null;
  return { base64: image.data, mime: image.mime_type ?? image.mimeType ?? "image/jpeg" };
}

/** Testo che il modello ha scritto al posto dell'immagine (es. un rifiuto), per spiegarlo a chi lavora. */
export function geminiTextFrom(response: unknown): string {
  const r = (response ?? {}) as GeminiInteraction;
  return (r.steps ?? [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => (b as { text?: string }).text ?? "")
    .join(" ")
    .trim();
}
