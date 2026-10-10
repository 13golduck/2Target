import "server-only";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";

import { db } from "@/db";
import { buyerPersonas, checkupQuestions, checkups, checkupSections, clients, competitors, objectives } from "@/db/schema";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { kpiSnapshot } from "@/lib/queries";
import { assertBudget, PHASE_ESTIMATE_USD } from "./budget";
import { callClaude, MODELS, modelFor, type AiMode, type Task } from "./claude";
import { ESEMPIO_CHECKUP } from "./esempio-checkup";
import { methodologyText } from "./metodologia";
import { REGISTER_LABELS, ReportSchema, type Register } from "@/lib/checkup-report";

// Check-up a quattro mani: l'AI cerca online, fa domande al consulente su ciò che non trova,
// approfondisce e scrive le 8 sezioni del modello Golduck. Il consulente rivede e approva.

type Checkup = typeof checkups.$inferSelect;
type Client = typeof clients.$inferSelect;

// ── Prompt di sistema (stabile, messo in cache) ──────────────────────

const SECTIONS_GUIDE = CHECKUP_SECTIONS.map(
  (s, i) =>
    `${i + 1}. ${s.title} [${s.key}]\n` +
    s.fields.map((f) => `   - ${f.key}: ${f.label}${f.kind === "elenco" ? " (elenco, una voce per riga)" : ""}`).join("\n") +
    (s.guide.length ? `\n   Domande guida: ${s.guide.join(" ")}` : ""),
).join("\n");

/** Prompt di sistema: ruolo + metodologia Golduck (versione del check-up) + struttura + esempio. In cache 1 ora. */
async function systemFor(checkup: Checkup): Promise<Anthropic.Beta.BetaTextBlockParam[]> {
  const method = await methodologyText(checkup.methodVersion);
  return [
    {
      type: "text",
      text: `Sei un consulente senior di marketing e comunicazione di Golduck, società di consulenza italiana per PMI.
Prepari il "Communication Check-Up" di un nuovo cliente lavorando a quattro mani con un consulente Golduck:
tu raccogli e analizzi le informazioni pubbliche, il consulente ti dà quelle interne. Il documento finale verrà
consegnato al cliente: deve essere concreto, specifico per quell'azienda e utile per decidere.

Principi di lavoro:
- Scrivi sempre in italiano.
- Non inventare numeri, nomi o fatti. Distingui sempre tra: dato verificato online (con fonte), informazione del
  consulente, tua ipotesi o stima (dichiarala come tale). Se un dato manca scrivi cosa servirebbe per averlo.
- Ragiona sul modello di business: chi paga davvero (B2B, B2C, intermediari), come si chiude una vendita, quali
  canali servono a quale fase del funnel.
- Le raccomandazioni nascono dai dati: prima l'evidenza, poi la conseguenza operativa.
- Per i social pubblici annota ciò che si vede: follower, frequenza di pubblicazione, formati, tipo di contenuti,
  interazioni visibili, link in bio, coerenza col posizionamento.

Metodologia Golduck (vincolante: struttura, stile, framework, regole sui dati):
<metodologia_golduck>
${method}
</metodologia_golduck>

Struttura del check-up (chiave sezione e chiavi dei campi):
${SECTIONS_GUIDE}

Esempio di check-up reale consegnato da Golduck (riferimento di profondità e concretezza; NON copiarne i contenuti):
<esempio>
${ESEMPIO_CHECKUP}
</esempio>`,
      // Un'ora: tra le domande al consulente e la ricerca passa spesso più di 5 minuti
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
}

// ── Contesto del cliente (cresce durante il lavoro) ──────────────────

async function clientContext(client: Client, checkup: Checkup, opts: { withAnswers?: boolean } = {}) {
  const parts = [
    `<dati_forniti_dal_consulente>`,
    `Azienda: ${client.name}`,
    `Registro del report: ${checkup.register === "auto" ? "scegli tu in base al tipo di cliente (istituzionale per enti e associazioni, commerciale per aziende di prodotto e startup) e dichiaralo" : REGISTER_LABELS[checkup.register as Register]}`,
    client.sector && `Settore indicato: ${client.sector}`,
    client.website && `Sito: ${client.website}`,
    client.vatNumber && `Partita IVA: ${client.vatNumber}`,
    client.city && `Sede / zona: ${client.city}`,
    client.contactName && `Referente: ${client.contactName}`,
    client.socialLinks && `Profili social indicati:\n${client.socialLinks}`,
    client.notes && `Appunti dell'incontro:\n${client.notes}`,
    `</dati_forniti_dal_consulente>`,
  ].filter(Boolean);

  if (checkup.previousId) {
    const [prev] = await db.select().from(checkups).where(eq(checkups.id, checkup.previousId));
    const prevSections = prev ? await db.select().from(checkupSections).where(eq(checkupSections.checkupId, prev.id)) : [];
    if (prev && prevSections.length) {
      parts.push(
        `<check_up_precedente periodo="${prev.period ?? ""}">\n` +
          prevSections.map((s) => `[${s.sectionKey}]\n${Object.entries(s.content).map(([k, v]) => `${k}: ${v}`).join("\n")}`).join("\n\n") +
          (prev.kpiSnapshot?.length ? `\n\nKPI a quella data:\n${prev.kpiSnapshot.map((k) => `- ${k.label}: ${k.value ?? "n.d."} (target ${k.target}, ${k.status})`).join("\n")}` : "") +
          `\n</check_up_precedente>`,
      );
    }
  }

  if (checkup.dossier) parts.push(`<appunti_di_ricerca>\n${checkup.dossier}\n</appunti_di_ricerca>`);

  if (opts.withAnswers) {
    const qs = await db.select().from(checkupQuestions).where(eq(checkupQuestions.checkupId, checkup.id)).orderBy(asc(checkupQuestions.round), asc(checkupQuestions.position));
    if (qs.length) {
      parts.push(
        `<risposte_del_consulente>\n` +
          qs.map((q) => `D: ${q.question}\nR: ${q.answer?.trim() ? q.answer : "(nessuna risposta: non noto)"}`).join("\n\n") +
          `\n</risposte_del_consulente>`,
      );
    }
  }
  return parts.join("\n");
}

// ── Avanzamento ──────────────────────────────────────────────────────

async function progress(checkupId: number, text: string) {
  const [c] = await db.select({ aiLog: checkups.aiLog }).from(checkups).where(eq(checkups.id, checkupId));
  const log = [...(c?.aiLog ?? []), { at: new Date().toISOString(), text }].slice(-60);
  await db.update(checkups).set({ aiProgress: text, aiLog: log }).where(eq(checkups.id, checkupId));
}

const mergeSources = (a: Checkup["sources"], b: { url: string; title?: string }[]) => {
  const map = new Map((a ?? []).map((s) => [s.url, s.title]));
  for (const s of b) if (!map.has(s.url)) map.set(s.url, s.title);
  return [...map].map(([url, title]) => ({ url, title })).slice(0, 200);
};

/** Prima di ogni fase: la si fa solo se la stima del suo costo sta nei limiti. */
async function guard(phase: keyof typeof PHASE_ESTIMATE_USD, task: Task, mode: AiMode, clientId: number, checkupId: number) {
  const tier = modelFor(mode, task) === MODELS.opus ? "opus" : "sonnet";
  await assertBudget({ clientId, checkupId, estimateUsd: PHASE_ESTIMATE_USD[phase][tier] });
}

async function load(checkupId: number) {
  const [checkup] = await db.select().from(checkups).where(eq(checkups.id, checkupId));
  if (!checkup) throw new Error("Check-up non trovato");
  const [client] = await db.select().from(clients).where(eq(clients.id, checkup.clientId));
  return { checkup, client, mode: (checkup.aiMode ?? "opus") as AiMode };
}

// ── 1. Ricognizione + prime domande ──────────────────────────────────

const QuestionsSchema = z.object({
  findings: z.array(z.object({ fact: z.string(), source: z.string() })),
  questions: z.array(z.object({ topic: z.string(), question: z.string(), why: z.string(), options: z.array(z.string()) })),
});

export async function runRecon(checkupId: number) {
  const { checkup, client, mode } = await load(checkupId);
  await guard("ricognizione", "ricerca", mode, client.id, checkupId);
  await progress(checkupId, "Ricognizione online avviata");

  const research = await callClaude({
    model: modelFor(mode, "ricerca"),
    system: await systemFor(checkup),
    web: { searches: 14, fetches: 14 },
    effort: "high",
    messages: [
      {
        role: "user",
        content: `${await clientContext(client, checkup)}

Fai la ricognizione di questa azienda cercando online (se c'è un check-up precedente, verifica soprattutto cosa è
cambiato da allora: canali, numeri, offerta, concorrenti). Parti dal sito (leggilo: pagine principali, prodotti o
servizi, a chi si rivolge, chiamate all'azione, area B2B, contatti) e cerca: profili social e cosa pubblicano,
recensioni e reputazione, articoli e premi, dati pubblici dell'azienda (anno di fondazione, sede, dimensione se nota),
3-8 probabili concorrenti diretti nella stessa area o nicchia.

Rispondi con appunti di ricerca in markdown, densi e verificabili, con queste parti:
## Identità e attività
## Offerta (prodotti, servizi, prezzi se pubblici)
## Clienti e mercato (a chi vende davvero, B2B/B2C, zona)
## Sito web (struttura, chiarezza, punti deboli, CTA, SEO evidente)
## Social (per ogni profilo: follower, frequenza, formati, contenuti, interazioni visibili, link in bio)
## Reputazione e stampa
## Concorrenti probabili (nome, link, perché sono concorrenti)
## Non verificato / da chiedere al consulente
Metti la fonte (URL) accanto a ogni dato.`,
      },
    ],
    onProgress: (t) => progress(checkupId, t),
    log: { step: "Ricognizione online", clientId: client.id, checkupId },
  });

  await db.update(checkups).set({ dossier: research.text, sources: mergeSources(checkup.sources, research.sources) }).where(eq(checkups.id, checkupId));
  await progress(checkupId, "Preparo le domande per il consulente");
  await askQuestions(checkupId, 1);
}

export async function askQuestions(checkupId: number, round: number) {
  const { checkup, client, mode } = await load(checkupId);
  await guard("domande", "domande", mode, client.id, checkupId);
  const first = round === 1;
  const r = await callClaude({
    model: modelFor(mode, "domande"),
    system: await systemFor(checkup),
    effort: "medium",
    maxTokens: 16_000,
    outputFormat: betaZodOutputFormat(QuestionsSchema),
    messages: [
      {
        role: "user",
        content: `${await clientContext(client, checkup, { withAnswers: !first })}

${
  first
    ? `Prepara il lavoro con il consulente.
- findings: 10-18 fatti chiave trovati online, ciascuno con la fonte (URL, o "consulente" se viene dai suoi dati).
- questions: 8-12 domande per il consulente su ciò che online NON si trova o è incerto e che cambia l'analisi.
  Pensa a: peso dei canali di vendita sul fatturato, clienti migliori e perché, obiettivi dei prossimi 12 mesi,
  budget e risorse interne per la comunicazione, cosa è stato provato e com'è andato, concorrenti da confermare
  (proponi quelli trovati), elementi distintivi che il cliente rivendica, vincoli (stagionalità, capacità produttiva),
  dati disponibili (fatturato, margini, tasso di riordino), tono desiderato.
  Domande specifiche per QUESTA azienda, non generiche. "why" spiega in una riga a cosa serve la risposta.
  "options" contiene 2-5 risposte rapide quando ha senso (altrimenti lista vuota).`
    : `Il consulente ha risposto alle domande. Se ci sono lacune importanti o risposte che aprono temi nuovi, fai al
massimo 6 domande di approfondimento (stesse regole). Se le informazioni bastano per un check-up completo,
restituisci "questions" vuota. "findings": solo eventuali nuovi fatti emersi (può essere vuota).`
}`,
      },
    ],
    log: { step: first ? "Domande (1° giro)" : `Domande (${round}° giro)`, clientId: client.id, checkupId },
  });

  const parsed = QuestionsSchema.parse(JSON.parse(r.text));
  if (parsed.questions.length) {
    await db.insert(checkupQuestions).values(
      parsed.questions.map((q, i) => ({ checkupId, round, position: i, topic: q.topic, question: q.question, why: q.why, options: q.options })),
    );
  }
  await db
    .update(checkups)
    .set({
      findings: [...(first ? [] : (checkup.findings ?? [])), ...parsed.findings.map((f) => ({ fact: f.fact, source: f.source }))],
      questionRound: round,
      aiState: "domande",
    })
    .where(eq(checkups.id, checkupId));
  await progress(checkupId, parsed.questions.length ? `${parsed.questions.length} domande pronte` : "Nessuna altra domanda: le informazioni bastano");
  return parsed.questions.length;
}

// ── 2. Ricerca approfondita + scrittura ──────────────────────────────

export async function runDeepResearch(checkupId: number) {
  const { checkup, client, mode } = await load(checkupId);
  await guard("ricerca", "ricerca", mode, client.id, checkupId);
  await progress(checkupId, "Ricerca approfondita avviata");
  const r = await callClaude({
    model: modelFor(mode, "ricerca"),
    system: await systemFor(checkup),
    web: { searches: 30, fetches: 25 },
    effort: "high",
    messages: [
      {
        role: "user",
        content: `${await clientContext(client, checkup, { withAnswers: true })}

Ora approfondisci online, tenendo conto delle risposte del consulente:
1. Concorrenti confermati (o i 4-6 più rilevanti): per ciascuno profilo, posizionamento, canali e come comunicano,
   punti di forza e debolezza, una best practice concreta. Leggi i loro siti e guarda i loro social.
2. Benchmark di settore: come comunicano i migliori nella nicchia, cosa funziona, trend rilevanti in Italia.
3. Pubblico: dove si informa e decide il cliente tipo (canali, fiere, community, riviste, ricerche Google).
4. Ricerca su Google: cosa trova chi cerca la categoria del cliente nella sua zona (chi compare, come).
5. Verifica ulteriore dei canali del cliente se servono dati mancanti (follower, frequenza, formati).
Rispondi con appunti in markdown per sezione, con la fonte (URL) accanto a ogni dato e una sezione finale
"Implicazioni per il cliente" con le tue conclusioni.`,
      },
    ],
    onProgress: (t) => progress(checkupId, t),
    log: { step: "Ricerca approfondita", clientId: client.id, checkupId },
  });
  await db
    .update(checkups)
    .set({ dossier: `${checkup.dossier ?? ""}\n\n# Ricerca approfondita\n\n${r.text}`, sources: mergeSources(checkup.sources, r.sources), aiState: "scrittura" })
    .where(eq(checkups.id, checkupId));
}

const sectionSchema = (key: string) => {
  const sec = CHECKUP_SECTIONS.find((s) => s.key === key)!;
  return z.object(Object.fromEntries(sec.fields.map((f) => [f.key, z.string()])) as Record<string, z.ZodString>);
};

const DocumentSchema = z.object({
  sections: z.object(Object.fromEntries(CHECKUP_SECTIONS.map((s) => [s.key, sectionSchema(s.key)]))),
  report: ReportSchema,
  personas: z.array(
    z.object({ name: z.string(), priority: z.number(), segment: z.enum(["b2b", "b2c"]), ageRange: z.string(), needs: z.string(), interests: z.string(), channels: z.string(), values: z.string(), lever: z.string() }),
  ),
  objectives: z.array(
    z.object({ stage: z.enum(["awareness", "consideration", "conversion", "retention"]), microObjectives: z.string(), strategicGoal: z.string(), strategies: z.array(z.string()), kpis: z.array(z.string()) }),
  ),
});

export async function runWriting(checkupId: number) {
  const { checkup, client, mode } = await load(checkupId);
  await guard("scrittura", "scrittura", mode, client.id, checkupId);
  await progress(checkupId, "Scrivo il check-up");
  const r = await callClaude({
    model: modelFor(mode, "scrittura"),
    system: await systemFor(checkup),
    effort: "high",
    maxTokens: 64_000,
    outputFormat: betaZodOutputFormat(DocumentSchema),
    messages: [
      {
        role: "user",
        content: `${await clientContext(client, checkup, { withAnswers: true })}

Scrivi il Communication Check-Up completo di ${client.name}, allo stesso livello di profondità dell'esempio.
- sections: tutte le sezioni e tutti i campi, testo pronto per il cliente (gli elenchi una voce per riga, senza
  trattini iniziali). Nel campo "canali" della sezione strumenti metti i numeri per canale. Nella sezione obiettivi,
  "fasi" riassume obiettivo, strategie e KPI di ogni fase del funnel.
- sections.sintesi: l'Executive Summary (diagnosi, 3 problemi con impatto, 3 azioni prioritarie).
- report: i dati per la pagina web e il PDF del report, coerenti con le sezioni:
  executive (stessi 3 problemi e 3 azioni), storybrand (cliente come guida, persona come eroe), channels (tutti i
  canali attuali e potenziali con efficacia attuale e potenziale da 0 a 5 e verdetto), funnel See-Think-Do-Care,
  competitors (3-5, con dati chiave, ER solo se calcolabile e con la fonte, inserzioni attive "non_verificato" se non
  hai potuto controllare, strengths, weaknesses e leva strategica), clientEr, swot, quickWins (5-8 con impatto,
  sforzo e chi le fa), evidence (criticità da documentare con screenshot).
- personas: almeno 3 buyer persona in ordine di valore strategico (priority 1 = più importante).
- objectives: una voce per ciascuna delle 4 fasi del funnel, con 3-6 strategie operative e 3-5 KPI misurabili.
- Campo "confronto" (sezione best_practice): se c'è un check-up precedente, cosa è cambiato da allora (numeri dei
  canali, KPI, raccomandazioni seguite o no, nuove priorità); altrimenti scrivi "Primo check-up".
Dove un dato non è verificato dichiaralo. Niente frasi generiche valide per qualunque azienda.`,
      },
    ],
    onProgress: (t) => progress(checkupId, t),
    log: { step: "Scrittura del check-up", clientId: client.id, checkupId },
  });
  const doc = DocumentSchema.parse(JSON.parse(r.text));

  for (const [sectionKey, content] of Object.entries(doc.sections)) {
    await db.insert(checkupSections).values({ checkupId, sectionKey, content }).onDuplicateKeyUpdate({ set: { content } });
  }
  // Concorrenti, persona e obiettivi restano legati a questo check-up (storico)
  for (const c of doc.report.competitors) {
    await db.insert(competitors).values({
      clientId: client.id,
      checkupId,
      name: c.name,
      location: c.location || null,
      profile: [
        c.website,
        `Canali: ${c.channels}`,
        `Community: ${c.community}`,
        `ER: ${c.er == null ? "n.d." : `${c.er}%`} (${c.erSource})`,
        `Inserzioni attive: ${c.ads === "si" ? "sì" : c.ads === "no" ? "no" : "non verificato"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      strengths: c.strengths.join("\n"),
      weaknesses: c.weaknesses.join("\n"),
      bestPractices: c.lever,
    });
  }
  if (doc.personas.length) {
    await db.insert(buyerPersonas).values(doc.personas.map((p) => ({ clientId: client.id, checkupId, ...p })));
  }
  if (doc.objectives.length) {
    await db.insert(objectives).values(
      doc.objectives.map((o) => ({ clientId: client.id, checkupId, stage: o.stage, microObjectives: o.microObjectives, strategicGoal: o.strategicGoal, operationalStrategies: [...o.strategies, ...o.kpis.map((k) => `KPI: ${k}`)] })),
    );
  }
  await db
    .update(checkups)
    .set({ aiState: "pronto", aiError: null, status: "in_revisione", completedAt: new Date(), report: doc.report, kpiSnapshot: await kpiSnapshot(client.id) })
    .where(eq(checkups.id, checkupId));
  await progress(checkupId, "Check-up pronto per la revisione");
}

// ── 3. Riscrittura di una sezione su indicazione del consulente ──────

export async function rewriteSection(checkupId: number, sectionKey: string, instruction: string) {
  const { checkup, client, mode } = await load(checkupId);
  const sec = CHECKUP_SECTIONS.find((s) => s.key === sectionKey);
  if (!sec) throw new Error("Sezione sconosciuta");
  await guard("revisione", "scrittura", mode, client.id, checkupId);
  const all = await db.select().from(checkupSections).where(eq(checkupSections.checkupId, checkupId));
  const content = all.find((s) => s.sectionKey === sectionKey)?.content ?? {};
  const schema = sectionSchema(sectionKey);
  const r = await callClaude({
    model: modelFor(mode, "scrittura"),
    system: await systemFor(checkup),
    effort: "medium",
    maxTokens: 16_000,
    outputFormat: betaZodOutputFormat(schema),
    messages: [
      {
        role: "user",
        content: `${await clientContext(client, checkup, { withAnswers: true })}

Sezione da rivedere: ${sec.title}
Testo attuale (JSON per campo):
${JSON.stringify(content, null, 2)}

Indicazione del consulente: ${instruction}

Riscrivi la sezione applicando l'indicazione. Mantieni ciò che non va cambiato. Restituisci tutti i campi.`,
      },
    ],
    log: { step: `Revisione: ${sec.title}`, clientId: client.id, checkupId },
  });
  const updated = schema.parse(JSON.parse(r.text));
  await db.insert(checkupSections).values({ checkupId, sectionKey, content: updated }).onDuplicateKeyUpdate({ set: { content: updated } });
}
