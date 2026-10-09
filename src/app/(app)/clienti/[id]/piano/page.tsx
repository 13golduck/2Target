import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { AlertTriangle, CircleAlert, Megaphone } from "lucide-react";

import { db } from "@/db";
import { editorialItems, editorialPlans, FORMATS, PLATFORMS } from "@/db/schema";
import { planIssues } from "@/lib/editorial-plan";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { toPlan, toPlanItem } from "@/lib/plan-adapter";
import { createItem, createPlan } from "../../../actions";

const STATUS = {
  bozza: "Bozza",
  da_approvare: "Da approvare",
  approvato: "Approvato",
  pubblicato: "Pubblicato",
  annullato: "Annullato",
} as const;

/** Lunedì della settimana in ora di Roma, come etichetta di gruppo. */
function weekOf(d: Date | null) {
  if (!d) return "Da programmare";
  const rome = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  rome.setDate(rome.getDate() - ((rome.getDay() + 6) % 7));
  return `Settimana del ${rome.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
}

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ piano?: string; nuovo?: string }> }) {
  const clientId = Number((await params).id);
  const sp = await searchParams;
  const plans = await db.select().from(editorialPlans).where(eq(editorialPlans.clientId, clientId)).orderBy(desc(editorialPlans.startsOn));
  const plan = plans.find((p) => p.id === Number(sp.piano)) ?? plans[0];

  if (!plan || sp.nuovo) return <NewPlanForm clientId={clientId} />;

  const items = await db.select().from(editorialItems).where(eq(editorialItems.planId, plan.id)).orderBy(asc(editorialItems.scheduledAt));
  const issues = planIssues(toPlan(plan), items.map(toPlanItem));
  const planLevel = issues.filter((i) => !i.itemId);
  const issuesOf = (id: number) => issues.filter((i) => i.itemId === String(id));
  const active = items.filter((i) => i.status !== "annullato");
  const paid = active.filter((i) => i.isPaid);
  const paidTotal = paid.reduce((t, i) => t + (i.adBudget ?? 0), 0);

  const groups = new Map<string, typeof items>();
  for (const i of items) groups.set(weekOf(i.scheduledAt), [...(groups.get(weekOf(i.scheduledAt)) ?? []), i]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {plans.map((p) => (
            <Link key={p.id} href={`?piano=${p.id}`} className={p.id === plan.id ? "btn" : "btn-ghost"}>{p.name}</Link>
          ))}
          <Link href="?nuovo=1" className="btn-ghost">+ Nuovo piano</Link>
        </div>
        <p className="text-sm text-muted">{fmtDate(plan.startsOn)} → {fmtDate(plan.endsOn)} · minimo {plan.minPerWeek} a settimana</p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {Object.entries(plan.formatQuotas ?? {}).map(([fmt, quota]) => {
          const n = active.filter((i) => i.format === fmt).length;
          return (
            <div key={fmt} className="card p-4">
              <p className="h-section">{fmt}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{n}<span className="text-base text-muted"> / {quota}</span></p>
              <div className="mt-2 h-1.5 rounded bg-black/5"><div className="h-1.5 rounded bg-gold" style={{ width: `${Math.min(100, (n / (quota || 1)) * 100)}%` }} /></div>
            </div>
          );
        })}
        <div className="card p-4">
          <p className="h-section">Sponsorizzate</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{paid.length}</p>
          <p className="text-xs text-muted">{paidTotal.toLocaleString("it-IT")} € {plan.adsBudget != null && `di ${plan.adsBudget.toLocaleString("it-IT")} €`}</p>
        </div>
        <div className="card p-4">
          <p className="h-section">Da sistemare</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{issues.filter((i) => i.level === "errore").length}</p>
          <p className="text-xs text-muted">{issues.filter((i) => i.level === "avviso").length} avvisi</p>
        </div>
      </div>

      {plan.brief && <p className="card bg-gold-soft p-4 text-sm"><b>Brief del cliente.</b> {plan.brief}</p>}

      {planLevel.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium">Controlli sul piano ({planLevel.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {planLevel.map((i, n) => (
              <li key={n} className={i.level === "errore" ? "text-bad" : "text-warn"}>• {i.message}</li>
            ))}
          </ul>
        </details>
      )}

      <form action={createItem} className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input type="hidden" name="planId" value={plan.id} />
        <input name="title" required placeholder="Titolo della nuova pubblicazione" className="field" />
        <select name="format" className="field" defaultValue="reel">{FORMATS.map((f) => <option key={f}>{f}</option>)}</select>
        <input type="datetime-local" name="scheduledAt" className="field" />
        <button className="btn">Crea scheda</button>
      </form>

      {[...groups.entries()].map(([week, list]) => (
        <section key={week} className="space-y-2">
          <h2 className="h-section">{week} · {list.length}</h2>
          <div className="card divide-y divide-line">
            {list.map((i) => {
              const own = issuesOf(i.id);
              const errors = own.filter((x) => x.level === "errore").length;
              return (
                <Link key={i.id} href={`/pubblicazioni/${i.id}`} className="grid gap-2 p-4 hover:bg-gold-soft/40 md:grid-cols-[150px_1fr_auto]">
                  <span className="text-sm text-muted">{fmtDateTime(i.scheduledAt)}</span>
                  <span>
                    <span className="font-medium">{i.title}</span>
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle text-[11px]">
                      <span className="rounded bg-gold-soft px-1.5">{i.format}</span>
                      <span className="rounded bg-black/5 px-1.5">{[i.platform, ...(i.crossPost ?? [])].join(" + ")}</span>
                      {i.isPaid && <span className="inline-flex items-center gap-0.5 rounded bg-foreground px-1.5 text-white"><Megaphone size={10} /> {i.adBudget ?? 0} €</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {errors > 0 ? (
                      <span className="inline-flex items-center gap-1 text-bad"><CircleAlert size={13} /> {errors} da completare</span>
                    ) : own.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-warn"><AlertTriangle size={13} /> {own.length} avvisi</span>
                    ) : (
                      <span className="text-ok">Completa</span>
                    )}
                    <span className="rounded-full bg-black/5 px-2 py-0.5">{STATUS[i.status]}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {items.length === 0 && <p className="text-sm text-muted">Nessuna pubblicazione: creane una qui sopra o pianifica un&apos;idea approvata.</p>}
    </div>
  );
}

function NewPlanForm({ clientId }: { clientId: number }) {
  return (
    <form action={createPlan} className="card space-y-4 p-5">
      <h2 className="h-section">Nuovo piano editoriale</h2>
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2"><label className="label">Nome</label><input name="name" className="field" placeholder="es. Piano settembre – gennaio" /></div>
        <div><label className="label">Dal</label><input type="date" name="startsOn" required className="field" /></div>
        <div><label className="label">Al</label><input type="date" name="endsOn" required className="field" /></div>
        <div><label className="label">Minimo a settimana</label><input name="minPerWeek" defaultValue={3} className="field" /></div>
        <div><label className="label">Reel richiesti</label><input name="quota:reel" className="field" /></div>
        <div><label className="label">Post richiesti</label><input name="quota:post" className="field" /></div>
        <div><label className="label">Caroselli richiesti</label><input name="quota:carosello" className="field" /></div>
        <div><label className="label">Budget sponsorizzate €</label><input name="adsBudget" className="field" /></div>
        <div className="md:col-span-3">
          <label className="label">Piattaforme</label>
          <div className="flex flex-wrap gap-3 text-sm">
            {PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name="platforms" value={p} defaultChecked={p === "instagram"} /> {p}</label>
            ))}
          </div>
        </div>
      </div>
      <div><label className="label">Brief del cliente</label><textarea name="brief" rows={4} className="field" /></div>
      <button className="btn">Crea piano</button>
    </form>
  );
}
