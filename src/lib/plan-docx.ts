// Piano editoriale in Word (.docx) da consegnare al cliente: copertina, una scheda per pubblicazione, riepilogo sponsorizzate.

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { editorialItems, editorialPlans, ShotListEntry } from "@/db/schema";
import { fmtDate } from "@/lib/format";

type Plan = typeof editorialPlans.$inferSelect;
type Item = typeof editorialItems.$inferSelect;

const GOLD = "CDA434";
const BLACK = "000000";
const GREY = "6B6B6B";
const FONT = "Arial";
const PAGE_W = 9638; // A4 meno margini da 2 cm, in twip

const L = {
  stage: { awareness: "Awareness (notorietà)", consideration: "Consideration (valutazione)", conversion: "Conversion (contatto)", retention: "Retention (fidelizzazione)" },
  destination: { sito: "Sito web", telefono: "Telefono", whatsapp: "WhatsApp", direct: "Messaggio diretto", modulo: "Modulo contatti", nessuna: "Nessuna" },
  objective: { notorieta: "Notorietà", traffico: "Traffico", interazione: "Interazione", contatti: "Contatti (lead)", messaggi: "Messaggi", chiamate: "Chiamate", vendite: "Vendite" },
  source: { cliente: "Gira il cliente", golduck: "Giriamo noi", ai: "Immagine AI", stock: "Stock" },
  platform: { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", newsletter: "Newsletter" },
} as const;

const label = <T extends Record<string, string>>(map: T, v: string | null | undefined) => (v ? (map[v as keyof T] ?? v) : null);
const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Data e ora di pubblicazione per esteso, ora di Roma. */
export const fmtWhen = (d: Date | null) =>
  d
    ? cap(d.toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }))
    : "Da programmare";

/** Pubblicazioni da consegnare: senza le annullate, in ordine di data (quelle senza data in fondo). */
export function deliverableItems(items: Item[]) {
  return items
    .filter((i) => i.status !== "annullato")
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity) || a.id - b.id);
}

// ── Mattoni ──────────────────────────────────────────────────────────

/** Testo su più righe (gli a capo del campo diventano a capo nel documento). */
function runs(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  return text.split(/\r?\n/).map((line, n) => new TextRun({ text: line, break: n ? 1 : 0, ...opts }));
}

const p = (text: string, opts: { bold?: boolean; color?: string; size?: number; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: opts.align, spacing: { after: opts.after ?? 120 }, children: runs(text, opts) });

/** Sottotitolo con la sua tabella, solo se almeno un campo è compilato. */
const block = (title: string, rows: [string, string | null | undefined][]) => {
  const table = fields(rows);
  return table.length ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(title)] }), ...table] : [];
};

const goldRule = () =>
  new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 4 } }, children: [] });

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const thin = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };

/** Campo che il cliente si aspetta in ogni pubblicazione: se manca resta visibile come "Da definire". */
const TBD = "Da definire";
const must = (v: string | null | undefined) => (v?.trim() ? v : TBD);

/** Tabella a due colonne etichetta/valore; le righe senza valore non compaiono. */
function fields(rows: [string, string | null | undefined][]) {
  const filled = rows.filter((r): r is [string, string] => !!r[1]?.trim());
  if (!filled.length) return [];
  const labelW = 2400;
  return [
    new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [labelW, PAGE_W - labelW],
      borders: { top: thin, bottom: thin, left: noBorder, right: noBorder, insideHorizontal: thin, insideVertical: noBorder },
      rows: filled.map(
        ([k, v]) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: labelW, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                shading: { type: ShadingType.CLEAR, color: "auto", fill: "F7F1DE" },
                children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 18 })] })],
              }),
              new TableCell({
                width: { size: PAGE_W - labelW, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 140, right: 100 },
                children: [new Paragraph({ children: v === TBD ? [new TextRun({ text: v, size: 20, italics: true, color: GREY })] : runs(v, { size: 20 }) })],
              }),
            ],
          }),
      ),
    }),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

function headerRow(cols: string[], widths: number[]) {
  return new TableRow({
    tableHeader: true,
    children: cols.map(
      (c, n) =>
        new TableCell({
          width: { size: widths[n], type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: BLACK },
          children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: "FFFFFF", size: 18 })] })],
        }),
    ),
  });
}

function bodyRow(cells: string[], widths: number[], opts: { bold?: boolean; fill?: string } = {}) {
  return new TableRow({
    cantSplit: true,
    children: cells.map(
      (c, n) =>
        new TableCell({
          width: { size: widths[n], type: WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
          children: [new Paragraph({ children: runs(c, { size: 18, bold: opts.bold }) })],
        }),
    ),
  });
}

const grid = { top: thin, bottom: thin, left: thin, right: thin, insideHorizontal: thin, insideVertical: thin };

const shotLine = (s: ShotListEntry, n: number) =>
  `${n + 1}. ${s.scena}${s.descrizione ? ` – ${s.descrizione}` : ""}${s.durata_s ? ` (${s.durata_s}″)` : ""} · ${label(L.source, s.fonte) ?? s.fonte}`;

// ── Documento ────────────────────────────────────────────────────────

export async function buildPlanDocx({ clientName, plan, items: all }: { clientName: string; plan: Plan; items: Item[] }) {
  const items = deliverableItems(all);
  const paid = items.filter((i) => i.isPaid);
  const paidTotal = paid.reduce((t, i) => t + (i.adBudget ?? 0), 0);
  const quotas = Object.entries(plan.formatQuotas ?? {}).filter(([, n]) => n);
  const period = `${fmtDate(plan.startsOn, { day: "numeric", month: "long", year: "numeric" })} – ${fmtDate(plan.endsOn, { day: "numeric", month: "long", year: "numeric" })}`;

  const cover = [
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [new TextRun({ text: "PIANO EDITORIALE", bold: true, color: GOLD, size: 22, characterSpacing: 40 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: clientName })] }),
    p(plan.name, { size: 32, after: 60 }),
    p(period, { color: GREY, size: 24, after: 240 }),
    goldRule(),
    ...fields([
      ["Quote per formato", quotas.length ? quotas.map(([f, n]) => `${n} ${f}`).join(" e ") : null],
      ["Frequenza minima", `${plan.minPerWeek} pubblicazioni a settimana`],
      ["Piattaforme", (plan.platforms ?? []).map((x) => label(L.platform, x)).join(", ") || null],
      ["Pubblicazioni nel piano", String(items.length)],
      ["Budget sponsorizzate", plan.adsBudget != null ? euro(plan.adsBudget) : null],
    ]),
    ...(plan.brief ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Brief del cliente")] }), p(plan.brief, { after: 200 })] : []),
  ];

  const sections = items.flatMap((i, n) => {
    const platforms = [i.platform, ...(i.crossPost ?? []).filter((x) => x !== i.platform)].map((x) => label(L.platform, x)).join(", ");
    const destination = [label(L.destination, i.ctaDestination), i.ctaUrl].filter(Boolean).join(" · ");
    return [
      new Paragraph({
        pageBreakBefore: true,
        keepNext: true,
        spacing: { after: 60 },
        children: [new TextRun({ text: `${String(n + 1).padStart(2, "0")} · ${fmtWhen(i.scheduledAt)}`, color: GOLD, bold: true, size: 20 })],
      }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(i.title)] }),
      ...fields([
        ["Formato", cap(i.format)],
        ["Piattaforme", platforms],
        ["Fase del funnel", label(L.stage, i.stage)],
      ]),
      ...block("Contenuto", [
        ["Hook", i.hook],
        ["Idea di layout", i.layoutNotes],
        ["Script / voiceover", i.script],
        ["Clip da girare", (i.shotList ?? []).map(shotLine).join("\n")],
        ["Testo a schermo", i.onScreenText],
        ["Audio", i.audioNotes],
      ]),
      ...block("Pubblicazione", [
        ["Caption", must(i.caption)],
        ["Hashtag", must(i.hashtags)],
        ["CTA", must(i.cta)],
        ["Destinazione", destination],
      ]),
      ...(i.isPaid
        ? block("Sponsorizzata", [
            ["Obiettivo", must(label(L.objective, i.adObjective))],
            ["Pulsante", must(i.adButton)],
            ["Budget", i.adBudget != null ? euro(i.adBudget) : TBD],
            ["Giorni", i.adDays != null ? String(i.adDays) : TBD],
            ["Pubblico", must(i.adAudience)],
          ])
        : []),
    ];
  });

  const w = [2200, 2638, 1500, 1500, 1000, 800];
  const summary = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun("Riepilogo sponsorizzate")] }),
    goldRule(),
    paid.length
      ? new Table({
          width: { size: PAGE_W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: w,
          borders: grid,
          rows: [
            headerRow(["Data", "Pubblicazione", "Obiettivo", "Pulsante", "Budget", "Giorni"], w),
            ...paid.map((i) =>
              bodyRow(
                [
                  i.scheduledAt ? cap(i.scheduledAt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short" })) : "Da programmare",
                  i.title,
                  label(L.objective, i.adObjective) ?? "—",
                  i.adButton ?? "—",
                  i.adBudget != null ? euro(i.adBudget) : "—",
                  i.adDays != null ? String(i.adDays) : "—",
                ],
                w,
              ),
            ),
            bodyRow([`Totale (${paid.length} sponsorizzat${paid.length === 1 ? "a" : "e"})`, "", "", "", euro(paidTotal), ""], w, { bold: true, fill: "F7F1DE" }),
          ],
        })
      : p("Nessuna pubblicazione sponsorizzata nel piano.", { color: GREY }),
    new Paragraph({ spacing: { before: 200 }, children: [] }),
    ...(plan.adsBudget != null
      ? [p(`Budget del piano: ${euro(plan.adsBudget)} · assegnato: ${euro(paidTotal)} · ${paidTotal <= plan.adsBudget ? `da assegnare: ${euro(plan.adsBudget - paidTotal)}` : `oltre il budget di ${euro(paidTotal - plan.adsBudget)}`}`, { size: 20 })]
      : []),
  ];

  const doc = new Document({
    creator: "2Target · Golduck",
    title: `${clientName} – ${plan.name}`,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: BLACK }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: FONT, size: 64, bold: true, color: BLACK } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 34, bold: true, color: BLACK }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true, color: BLACK }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1, keepNext: true, border: { left: { style: BorderStyle.SINGLE, size: 24, color: GOLD, space: 6 } } } },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 6 } },
                children: [
                  new TextRun({ text: "2Target", bold: true, size: 16 }),
                  new TextRun({ text: " · powered by ", size: 16, color: GREY }),
                  new TextRun({ text: "Golduck", bold: true, size: 16, color: GOLD }),
                  new TextRun({ text: "   |   ", size: 16, color: GREY }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
                ],
              }),
            ],
          }),
        },
        children: [...cover, ...sections, ...summary],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/** Nome file leggibile: "Piano editoriale - Lesioli - Piano settembre gennaio.docx" */
export function planFileName(clientName: string, planName: string) {
  const clean = (s: string) => s.replace(/[–—]/g, "-").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim();
  return `Piano editoriale - ${clean(clientName)} - ${clean(planName)}.docx`;
}
