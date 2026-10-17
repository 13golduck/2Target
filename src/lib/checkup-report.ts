import { z } from "zod";

// Dati strutturati del report del check-up: servono alla pagina web (grafici, tabelle, matrici) e al PDF.
// Il testo completo resta nelle sezioni; qui ci sono solo i dati da visualizzare.

const level = z.enum(["basso", "medio", "alto"]);

export const ReportSchema = z.object({
  executive: z.object({
    headline: z.string().describe("Una frase: la diagnosi in sintesi"),
    problems: z.array(z.object({ title: z.string(), impact: z.string().describe("Impatto sul business") })).describe("Esattamente 3"),
    actions: z
      .array(z.object({ title: z.string(), why: z.string(), when: z.string().describe("Es. entro 30 giorni") }))
      .describe("Esattamente 3, in ordine di priorità"),
  }),
  storybrand: z.object({
    hero: z.string().describe("L'eroe: la buyer persona principale"),
    problem: z.string(),
    guide: z.string().describe("Il cliente come guida: empatia e autorevolezza"),
    plan: z.string(),
    cta: z.string(),
    success: z.string(),
    failure: z.string().describe("Cosa rischia l'eroe se non agisce"),
  }),
  channels: z
    .array(
      z.object({
        name: z.string(),
        current: z.number().describe("Efficacia attuale, intero da 0 a 5"),
        potential: z.number().describe("Potenziale strategico, intero da 0 a 5"),
        verdict: z.enum(["miniera_d_oro", "da_rafforzare", "efficace", "spreco", "non_prioritario"]),
        note: z.string(),
      }),
    )
    .describe("Tutti i canali attuali e quelli potenziali (anche non ancora usati: current 0)"),
  funnel: z
    .array(
      z.object({
        stage: z.enum(["see", "think", "do", "care"]),
        goal: z.string(),
        kpis: z.array(z.string()),
      }),
    )
    .describe("See = Awareness, Think = Consideration, Do = Conversion, Care = Retention"),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        location: z.string(),
        website: z.string(),
        channels: z.string().describe("Canali attivi"),
        community: z.string().describe("Dimensione community, es. 12.400 follower Instagram"),
        er: z.number().nullable().describe("Engagement rate in % se calcolabile, altrimenti null"),
        erSource: z.string().describe("Come è stato ottenuto l'ER o 'non disponibile'"),
        ads: z.enum(["si", "no", "non_verificato"]).describe("Inserzioni attive nella Libreria inserzioni Meta"),
        strengths: z.array(z.string()),
        weaknesses: z.array(z.string()),
        lever: z.string().describe("La leva strategica: la lezione da copiare, adattare o migliorare"),
      }),
    )
    .describe("3-5 competitor"),
  clientEr: z.number().nullable().describe("ER del cliente in % sul canale principale, se calcolabile"),
  swot: z.object({ s: z.array(z.string()), w: z.array(z.string()), o: z.array(z.string()), t: z.array(z.string()) }),
  quickWins: z
    .array(z.object({ action: z.string(), impact: level, effort: level, owner: z.string().describe("Chi la fa: cliente, Golduck, entrambi") }))
    .describe("5-8 azioni"),
  evidence: z.array(z.string()).describe("Criticità da documentare con uno screenshot (il consulente lo allegherà)"),
});

export type CheckupReport = z.infer<typeof ReportSchema>;

// L'API rifiuta schemi di risposta troppo grandi: i dati del report si chiedono in due metà (verificato).
const sh = ReportSchema.shape;
export const ReportPartA = z.object({ executive: sh.executive, storybrand: sh.storybrand, channels: sh.channels, funnel: sh.funnel });
export const ReportPartB = z.object({ competitors: sh.competitors, clientEr: sh.clientEr, swot: sh.swot, quickWins: sh.quickWins, evidence: sh.evidence });

export const REGISTERS = ["auto", "istituzionale", "commerciale"] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_LABELS: Record<Register, string> = {
  auto: "Lo sceglie l'AI in base al cliente",
  istituzionale: "Istituzionale e formale (enti, associazioni)",
  commerciale: "Dinamico e commerciale (startup, aziende di prodotto)",
};

/** Livello di ragionamento dell'AI scelto all'avvio del check-up. */
export const REASONING = ["veloce", "avanzato"] as const;
export type Reasoning = (typeof REASONING)[number];
