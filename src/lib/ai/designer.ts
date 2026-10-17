import "server-only";
import { desc, eq } from "drizzle-orm";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { brandKits, buyerPersonas, checkupSections, checkups, clients, editorialItems } from "@/db/schema";
import { BrandKitSchema, BriefSchema, ReviewSchema, type BrandKitData } from "@/lib/design-types";
import { assertBudget } from "./budget";
import { callClaude, MODELS } from "./claude";

// Studio grafico: l'AI nel ruolo di Senior Graphic Designer di Golduck. Non lavora dentro InDesign o Canva:
// scrive brief che un designer realizza in pochi minuti, propone il brand kit e rivede le grafiche come un art director.

const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [
  {
    type: "text",
    text: `Sei il Senior Graphic Designer di Golduck, agenzia di consulenza e comunicazione italiana.
Conosci a fondo InDesign, Illustrator, Photoshop e Canva e progetti grafiche per Instagram, Facebook, LinkedIn e TikTok:
post singoli, caroselli, storie, reel e grafiche promozionali.

Il tuo stile:
- Minimal: poche idee forti, molto spazio bianco, una gerarchia chiara (un solo elemento dominante per grafica).
- Preciso e attento ai dettagli: griglie, margini di sicurezza, allineamenti, interlinea, contrasto leggibile (WCAG AA),
  testo sulla grafica breve (massimo 8-10 parole per titolo), formati corretti per piattaforma.
- Sai spiegare le scelte: ogni decisione ha un perché legato al pubblico, all'obiettivo e al brand.

Regole:
- Scrivi in italiano, concreto, senza gergo inutile.
- Rispetta il brand kit del cliente se c'è; se manca, proponi scelte coerenti e dichiaralo.
- Misure standard: feed 1080×1350 (4:5), quadrato 1080×1080, storie e reel 1080×1920 (9:16) con area sicura
  di 250 px in alto e in basso, LinkedIn 1200×1500 o 1080×1080, copertina reel leggibile anche ritagliata 1:1.
- Nei passi per Canva e Adobe indica strumenti e impostazioni reali (es. griglia, Allinea, Stili di carattere,
  Livelli di regolazione), non istruzioni generiche.
- Non inventare dati sul cliente: usa solo il contesto fornito.`,
    cache_control: { type: "ephemeral", ttl: "1h" },
  },
];

export async function clientContext(clientId: number) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  const [kit] = await db.select().from(brandKits).where(eq(brandKits.clientId, clientId));
  const [last] = await db.select({ id: checkups.id }).from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1);
  const sections = last ? await db.select().from(checkupSections).where(eq(checkupSections.checkupId, last.id)) : [];
  const pos = sections.find((s) => s.sectionKey === "posizionamento")?.content;
  const personas = await db.select().from(buyerPersonas).where(eq(buyerPersonas.clientId, clientId)).orderBy(buyerPersonas.priority).limit(3);
  return {
    client,
    kit,
    text: [
      `<cliente>`,
      `Nome: ${client.name}`,
      client.sector && `Settore: ${client.sector}`,
      client.website && `Sito: ${client.website}`,
      pos?.attuale && `Posizionamento: ${pos.attuale}`,
      pos?.tone_of_voice && `Tone of voice: ${pos.tone_of_voice}`,
      personas.length && `Buyer persona: ${personas.map((p) => `${p.name} (${p.ageRange ?? ""}; leva: ${p.lever ?? ""})`).join("; ")}`,
      `</cliente>`,
      kit ? `<brand_kit>\n${JSON.stringify(kit.data, null, 2)}\n</brand_kit>` : `<brand_kit>Non ancora definito.</brand_kit>`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Proposta di brand kit dal posizionamento del cliente (il consulente la rivede e la salva). */
export type LogoColor = { hex: string; share: number };

/**
 * Proposta di brand kit. Se c'è un logo, la palette parte dai suoi colori: quelli misurati da 2Target
 * (codici esatti) e l'immagine stessa, che l'AI guarda per capirne lo stile.
 */
export async function draftBrandKit(clientId: number, logoColors: LogoColor[] = [], unsavedLogo?: string | null): Promise<BrandKitData> {
  await assertBudget({ clientId, estimateUsd: 0.15 });
  const ctx = await clientContext(clientId);
  const [kit] = await db.select({ logo: brandKits.logo }).from(brandKits).where(eq(brandKits.clientId, clientId));
  // Il logo appena caricato (non ancora salvato) ha la precedenza su quello in archivio
  const raster = (unsavedLogo || kit?.logo)?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  const logoImage = raster && raster[2].length < 4_000_000 ? { mediaType: raster[1], data: raster[2] } : null;
  const colorsText = logoColors.length
    ? `Colori misurati nel logo (codice esatto e quota dei pixel colorati):\n${logoColors.map((c) => `- ${c.hex} (${Math.round(c.share * 100)}%)`).join("\n")}`
    : "";
  const logoRule =
    logoColors.length || logoImage
      ? `\nIl logo è il punto di partenza: la palette DEVE includere i colori principali del logo con i loro codici esatti
(ignora bianco e nero puri se sono solo sfondo o contorni), dando a ciascuno un ruolo (primario, secondario, accento…).
Aggiungi solo colori di supporto coerenti con il logo (neutri per sfondi e testi, eventualmente un accento) e spiega
nel ruolo da dove viene ogni colore ("dal logo" oppure "di supporto"). Anche tono visivo e stile delle immagini devono
essere coerenti con il carattere del logo.`
      : "";
  const r = await callClaude({
    model: MODELS.sonnet,
    system: SYSTEM,
    effort: "medium",
    maxTokens: 8000,
    outputFormat: betaZodOutputFormat(BrandKitSchema),
    messages: [
      {
        role: "user",
        content: [
          ...(logoImage
            ? [{ type: "image" as const, source: { type: "base64" as const, media_type: logoImage.mediaType as "image/png", data: logoImage.data } }]
            : []),
          {
            type: "text" as const,
            text: `${ctx.text}
${logoImage ? "\nL'immagine allegata è il logo attuale del cliente." : ""}
${colorsText}
Proponi il brand kit di ${ctx.client.name}: palette di 4-6 colori con ruolo, 2 font (titoli e testo) con alternativa
Canva, tono visivo, stile delle immagini, 4-6 regole di composizione, 4-6 cose da fare e 4-6 da evitare.
Se esiste già un brand kit, miglioralo senza stravolgerlo.${logoRule}`,
          },
        ],
      },
    ],
    log: { step: "Studio grafico: brand kit", clientId },
  });
  return BrandKitSchema.parse(JSON.parse(r.text));
}

/** Brief grafico per una pubblicazione del piano editoriale. */
export async function generateBrief(itemId: number, note?: string) {
  const [item] = await db.select().from(editorialItems).where(eq(editorialItems.id, itemId));
  if (!item) throw new Error("Pubblicazione non trovata");
  await assertBudget({ clientId: item.clientId, estimateUsd: 0.2 });
  const ctx = await clientContext(item.clientId);
  const fields = [
    `Titolo: ${item.title}`,
    `Piattaforma: ${item.platform}${item.crossPost?.length ? ` (anche ${item.crossPost.join(", ")})` : ""}`,
    `Formato: ${item.format}`,
    item.stage && `Fase del funnel: ${item.stage}`,
    item.hook && `Gancio: ${item.hook}`,
    item.layoutNotes && `Note di layout del piano: ${item.layoutNotes}`,
    item.script && `Script: ${item.script}`,
    item.onScreenText && `Testo a schermo previsto: ${item.onScreenText}`,
    item.caption && `Caption: ${item.caption}`,
    item.cta && `CTA: ${item.cta}`,
    item.isPaid && `Sponsorizzata: obiettivo ${item.adObjective ?? "n.d."}, pulsante ${item.adButton ?? "n.d."}`,
    item.creativeBrief && `Brief precedente (da migliorare): ${item.creativeBrief.concept}`,
  ].filter(Boolean);
  const r = await callClaude({
    model: MODELS.sonnet,
    system: SYSTEM,
    effort: "medium",
    maxTokens: 12_000,
    outputFormat: betaZodOutputFormat(BriefSchema),
    messages: [
      {
        role: "user",
        content: `${ctx.text}

<pubblicazione>
${fields.join("\n")}
</pubblicazione>
${note ? `\nIndicazione del consulente: ${note}\n` : ""}
Scrivi il brief grafico di questa pubblicazione, pronto per chi la realizza in Canva o in Adobe.`,
      },
    ],
    log: { step: "Studio grafico: brief", clientId: item.clientId },
  });
  const brief = BriefSchema.parse(JSON.parse(r.text));
  await db.update(editorialItems).set({ creativeBrief: brief }).where(eq(editorialItems.id, itemId));
  return brief;
}

/** Revisione da art director di una grafica caricata (immagine in base64, non conservata). */
export async function reviewDesign(o: { clientId: number; itemId?: number | null; mediaType: string; base64: string }) {
  await assertBudget({ clientId: o.clientId, estimateUsd: 0.1 });
  const ctx = await clientContext(o.clientId);
  const [item] = o.itemId ? await db.select().from(editorialItems).where(eq(editorialItems.id, o.itemId)) : [];
  const r = await callClaude({
    model: MODELS.sonnet,
    system: SYSTEM,
    effort: "medium",
    maxTokens: 6000,
    outputFormat: betaZodOutputFormat(ReviewSchema),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: o.mediaType as "image/png", data: o.base64 } },
          {
            type: "text",
            text: `${ctx.text}
${item ? `\n<pubblicazione>\nTitolo: ${item.title}\nPiattaforma: ${item.platform}\nFormato: ${item.format}\n${item.creativeBrief ? `Brief: ${item.creativeBrief.concept}` : ""}\n</pubblicazione>\n` : ""}
Rivedi questa grafica come un art director prima della pubblicazione: gerarchia, leggibilità, contrasto,
allineamenti, spaziature, coerenza col brand kit, testo, formato e messaggio. Elenca solo problemi reali,
ognuno con una correzione concreta. Voto da 1 a 10.`,
          },
        ],
      },
    ],
    log: { step: "Studio grafico: revisione", clientId: o.clientId },
  });
  const result = ReviewSchema.parse(JSON.parse(r.text));
  return { ...result, score: Math.max(1, Math.min(10, Math.round(result.score))) };
}
