import { z } from "zod";

// Studio grafico AI (Senior Graphic Designer): brand kit del cliente, brief grafico per pubblicazione,
// revisione delle grafiche. Schemi condivisi tra AI, database e interfaccia.

export const BrandKitSchema = z.object({
  palette: z.array(z.object({ name: z.string(), hex: z.string().describe("Formato #RRGGBB"), role: z.string().describe("Es. primario, accento, sfondo, testo") })),
  fonts: z.array(z.object({ name: z.string(), use: z.string().describe("Es. titoli, testo, accenti"), alternative: z.string().describe("Alternativa disponibile su Canva") })),
  visualTone: z.string().describe("Il tono visivo in 2-3 frasi"),
  imagery: z.string().describe("Stile di foto e illustrazioni"),
  layoutRules: z.array(z.string()).describe("Regole di composizione: margini, griglia, spazio bianco, gerarchia"),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
});
export type BrandKitData = z.infer<typeof BrandKitSchema>;

export const BriefSchema = z.object({
  concept: z.string().describe("L'idea visiva in una frase"),
  why: z.string().describe("Perché funziona per questo pubblico e questo obiettivo"),
  format: z.string().describe("Formato e misure, es. 1080×1350 (4:5)"),
  layout: z.string().describe("Composizione: griglia, posizione degli elementi, spazio bianco"),
  frames: z
    .array(z.object({ title: z.string(), visual: z.string(), text: z.string().describe("Testo sulla grafica, breve") }))
    .describe("Slide del carosello o scene del reel; per un post singolo una sola voce"),
  hierarchy: z.object({ headline: z.string(), support: z.string(), cta: z.string() }),
  palette: z.array(z.object({ hex: z.string(), use: z.string() })),
  typography: z.string().describe("Font, pesi e dimensioni relative"),
  imagery: z.string().describe("Foto, illustrazione o elementi grafici: cosa e come"),
  tools: z.object({
    canva: z.string().describe("Come realizzarlo in Canva, passi concreti"),
    adobe: z.string().describe("Come realizzarlo in InDesign, Illustrator o Photoshop"),
  }),
  checklist: z.array(z.string()).describe("Controlli prima della pubblicazione"),
});
export type CreativeBrief = z.infer<typeof BriefSchema>;

export const ReviewSchema = z.object({
  score: z.number().describe("Voto complessivo da 1 a 10"),
  verdict: z.enum(["pronta", "piccole_correzioni", "da_rifare"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  issues: z.array(
    z.object({
      area: z.enum(["gerarchia", "leggibilita", "contrasto", "allineamento", "spaziatura", "brand", "testo", "formato", "messaggio"]),
      severity: z.enum(["alta", "media", "bassa"]),
      problem: z.string(),
      fix: z.string().describe("Come correggerlo, concreto"),
    }),
  ),
});
export type DesignReview = z.infer<typeof ReviewSchema>;
