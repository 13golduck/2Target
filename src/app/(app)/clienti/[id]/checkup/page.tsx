import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { checkupSections, checkups } from "@/db/schema";
import { CHECKUP_SECTIONS } from "@/lib/checkup-template";
import { fmtDate } from "@/lib/format";
import { createCheckup, saveCheckupSection, setCheckupStatus } from "../../../actions";

const STATUS_LABEL = { bozza: "Bozza", in_revisione: "In revisione", consegnato: "Consegnato" } as const;

export default async function CheckupPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const [checkup] = await db.select().from(checkups).where(eq(checkups.clientId, clientId)).orderBy(desc(checkups.id)).limit(1);

  if (!checkup) {
    return (
      <form action={createCheckup} className="card flex flex-wrap items-end gap-3 p-5">
        <input type="hidden" name="clientId" value={clientId} />
        <div>
          <label className="label">Periodo</label>
          <input name="period" className="field" placeholder="es. Ottobre 2026" />
        </div>
        <button className="btn">Inizia il check-up</button>
      </form>
    );
  }

  const sections = await db.select().from(checkupSections).where(eq(checkupSections.checkupId, checkup.id));
  const contentOf = (key: string) => sections.find((x) => x.sectionKey === key)?.content ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{checkup.title} · {checkup.period}</p>
          <p className="text-xs text-muted">
            {STATUS_LABEL[checkup.status]}
            {checkup.deliveredAt && ` il ${fmtDate(checkup.deliveredAt)}`}
          </p>
        </div>
        <form action={setCheckupStatus} className="flex gap-2">
          <input type="hidden" name="checkupId" value={checkup.id} />
          <select name="status" defaultValue={checkup.status} className="field w-40">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-ghost">Aggiorna</button>
        </form>
      </div>

      {CHECKUP_SECTIONS.map((sec, i) => {
        const content = contentOf(sec.key);
        const filled = sec.fields.filter((f) => content[f.key]?.trim()).length;
        return (
          <details key={sec.key} className="card group" open={i === 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-5">
              <span className="font-semibold">{i + 1}. {sec.title}</span>
              <span className="text-xs text-muted">{filled}/{sec.fields.length} compilati</span>
            </summary>
            <form action={saveCheckupSection} className="space-y-4 border-t border-line p-5">
              <input type="hidden" name="checkupId" value={checkup.id} />
              <input type="hidden" name="sectionKey" value={sec.key} />
              {sec.guide.length > 0 && (
                <ul className="rounded-lg bg-gold-soft px-4 py-3 text-sm">
                  {sec.guide.map((g) => <li key={g}>• {g}</li>)}
                </ul>
              )}
              {sec.fields.map((f) => (
                <div key={f.key}>
                  <label className="label">{f.label}{f.kind === "elenco" && " · una voce per riga"}</label>
                  <textarea name={`field:${f.key}`} defaultValue={content[f.key] ?? ""} rows={f.kind === "testo" ? 4 : 5} className="field" />
                </div>
              ))}
              <button className="btn">Salva sezione</button>
            </form>
          </details>
        );
      })}
    </div>
  );
}
