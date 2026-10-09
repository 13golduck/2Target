import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import * as s from "@/db/schema";
import { AD_BUTTONS_BY_DESTINATION, itemIssues } from "@/lib/editorial-plan";
import { toRomeInput } from "@/lib/format";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { toPlanItem } from "@/lib/plan-adapter";
import { deleteItem, saveItem } from "../../actions";
import { ShotList } from "./shot-list";
import { PaidToggle } from "./paid-toggle";

const L = {
  status: { bozza: "Bozza", da_approvare: "Da approvare", approvato: "Approvato", pubblicato: "Pubblicato", annullato: "Annullato" },
  production: { da_fare: "Da fare", materiale_richiesto: "Materiale richiesto al cliente", in_montaggio: "In montaggio", pronto: "Pronto" },
  destination: { sito: "Sito web", telefono: "Telefono", whatsapp: "WhatsApp", direct: "Messaggio diretto", modulo: "Modulo contatti", nessuna: "Nessuna" },
  objective: { notorieta: "Notorietà", traffico: "Traffico", interazione: "Interazione", contatti: "Contatti (lead)", messaggi: "Messaggi", chiamate: "Chiamate", vendite: "Vendite" },
} as const;

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvato?: string }> }) {
  const id = Number((await params).id);
  const { salvato } = await searchParams;
  const [item] = await db.select().from(s.editorialItems).where(eq(s.editorialItems.id, id));
  if (!item) notFound();
  const [client] = await db.select().from(s.clients).where(eq(s.clients.id, item.clientId));
  const series = await db.select().from(s.contentSeries).where(eq(s.contentSeries.clientId, item.clientId));
  const personas = await db.select().from(s.buyerPersonas).where(eq(s.buyerPersonas.clientId, item.clientId));
  const issues = itemIssues(toPlanItem(item));
  const allButtons = [...new Set(Object.values(AD_BUTTONS_BY_DESTINATION).flat())];
  const back = `/clienti/${item.clientId}/piano${item.planId ? `?piano=${item.planId}` : ""}`;

  return (
    <form action={saveItem} className="space-y-5">
      <input type="hidden" name="id" value={item.id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={back} className="text-sm text-muted hover:text-foreground">← Piano editoriale · {client?.name}</Link>
          <textarea name="title" defaultValue={item.title} rows={1} className="mt-1 w-full resize-none bg-transparent text-2xl font-bold outline-none [field-sizing:content] focus:underline decoration-gold" />
        </div>
        <div className="flex items-center gap-2">
          <select name="status" defaultValue={item.status} className="field w-40">
            {Object.entries(L.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn">Salva</button>
        </div>
      </div>

      {salvato && <p className="rounded-lg bg-ok-soft px-4 py-2 text-sm text-ok">Scheda salvata.</p>}
      {issues.length > 0 && (
        <ul className="card space-y-1 p-4 text-sm">
          {issues.map((i, n) => (
            <li key={n} className={i.level === "errore" ? "text-bad" : "text-warn"}>
              • {i.message.replace(`"${item.title}": `, "")}
            </li>
          ))}
        </ul>
      )}

      <Section title="Pubblicazione">
        <Field label="Data e ora (ora italiana)"><input type="datetime-local" name="scheduledAt" defaultValue={toRomeInput(item.scheduledAt)} className="field" /></Field>
        <Field label="Formato">
          <select name="format" defaultValue={item.format} className="field">{s.FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
        </Field>
        <Field label="Piattaforma principale">
          <select name="platform" defaultValue={item.platform} className="field">{s.PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
        </Field>
        <Field label="Ripubblica anche su">
          <div className="flex flex-wrap gap-3 pt-2 text-sm">
            {["instagram", "facebook", "tiktok", "linkedin"].map((p) => (
              <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name="crossPost" value={p} defaultChecked={item.crossPost?.includes(p)} /> {p}</label>
            ))}
          </div>
        </Field>
        <Field label="Fase del funnel">
          <select name="stage" defaultValue={item.stage ?? ""} className="field">
            <option value="">—</option>
            {FUNNEL_STAGES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Rubrica">
          <select name="seriesId" defaultValue={item.seriesId ?? ""} className="field">
            <option value="">—</option>
            {series.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Buyer persona">
          <select name="personaId" defaultValue={item.personaId ?? ""} className="field">
            <option value="">—</option>
            {personas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Contenuto">
        <Field label="Hook · prima frase o primi 3 secondi" wide><textarea name="hook" defaultValue={item.hook ?? ""} rows={2} className="field" /></Field>
        <Field label="Idea di layout · grafica, slide, inquadrature" wide><textarea name="layoutNotes" defaultValue={item.layoutNotes ?? ""} rows={4} className="field" /></Field>
        <Field label="Script / voiceover · cosa deve dire" wide><textarea name="script" defaultValue={item.script ?? ""} rows={8} className="field font-mono text-[13px]" /></Field>
        <Field label="Testo a schermo"><textarea name="onScreenText" defaultValue={item.onScreenText ?? ""} rows={3} className="field" /></Field>
        <Field label="Audio / musica"><textarea name="audioNotes" defaultValue={item.audioNotes ?? ""} rows={3} className="field" /></Field>
        <div className="md:col-span-2">
          <p className="label">Clip da girare / immagini</p>
          <ShotList initial={item.shotList ?? []} />
        </div>
      </Section>

      <Section title="Testo e invito all'azione">
        <Field label="Caption" wide><textarea name="caption" defaultValue={item.caption ?? ""} rows={6} className="field" /></Field>
        <Field label="Hashtag · separati da spazio" wide><input name="hashtags" defaultValue={item.hashtags ?? ""} className="field" placeholder="#architetto #ristrutturazione" /></Field>
        <Field label="CTA · invito all'azione nel testo"><input name="cta" defaultValue={item.cta ?? ""} className="field" placeholder="es. Chiamami per una prima consulenza" /></Field>
        <Field label="Dove porta la CTA">
          <select name="ctaDestination" defaultValue={item.ctaDestination ?? ""} className="field">
            <option value="">—</option>
            {Object.entries(L.destination).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Link / numero di destinazione" wide><input name="ctaUrl" defaultValue={item.ctaUrl ?? ""} className="field" placeholder="https://… oppure +39…" /></Field>
        <Field label="Riferimenti · competitor, ispirazioni (un link per riga)" wide><textarea name="referencesUrls" defaultValue={item.referencesUrls ?? ""} rows={2} className="field" /></Field>
      </Section>

      <Section title="Produzione">
        <Field label="Stato produzione">
          <select name="productionStatus" defaultValue={item.productionStatus} className="field">
            {Object.entries(L.production).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label=" ">
          <label className="flex items-center gap-2 pt-2 text-sm"><input type="checkbox" name="needsClientMaterial" defaultChecked={item.needsClientMaterial} /> Serve materiale dal cliente</label>
        </Field>
        <Field label="Note di produzione · cosa chiedere, immagini AI, render" wide><textarea name="productionNotes" defaultValue={item.productionNotes ?? ""} rows={3} className="field" /></Field>
      </Section>

      <PaidToggle defaultChecked={item.isPaid}>
        <Field label="Obiettivo">
          <select name="adObjective" defaultValue={item.adObjective ?? ""} className="field">
            <option value="">—</option>
            {Object.entries(L.objective).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Pulsante dell'inserzione">
          <input name="adButton" list="ad-buttons" defaultValue={item.adButton ?? ""} className="field" />
          <datalist id="ad-buttons">{allButtons.map((b) => <option key={b} value={b} />)}</datalist>
          <p className="mt-1 text-xs text-muted">Sito → Scopri di più · Telefono → Chiama ora · WhatsApp → Invia messaggio WhatsApp</p>
        </Field>
        <Field label="Budget €"><input name="adBudget" defaultValue={item.adBudget ?? ""} className="field" /></Field>
        <Field label="Durata (giorni)"><input name="adDays" defaultValue={item.adDays ?? ""} className="field" /></Field>
        <Field label="Pubblico · zona, età, interessi" wide><textarea name="adAudience" defaultValue={item.adAudience ?? ""} rows={2} className="field" /></Field>
      </PaidToggle>

      <Section title="Note">
        <Field label="Note interne" wide><textarea name="internalNotes" defaultValue={item.internalNotes ?? ""} rows={3} className="field" /></Field>
        <Field label="Link al post pubblicato" wide><input name="publishedUrl" defaultValue={item.publishedUrl ?? ""} className="field" /></Field>
      </Section>

      <div className="flex items-center justify-between">
        <button className="btn">Salva scheda</button>
        <button formAction={deleteItem} formNoValidate className="text-sm text-muted hover:text-bad">Elimina scheda</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="h-section mb-4">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
