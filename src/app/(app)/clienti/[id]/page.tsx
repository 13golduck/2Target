import { StatusBadge } from "@/components/status-badge";
import { fmtDate, fmtMetric } from "@/lib/format";
import { METRICS } from "@/lib/kpi-catalog";
import { kpisWithStatus } from "@/lib/queries";
import { addKpi, addMeasurement, deleteKpi } from "../../actions";

const SCOPES = [
  { key: "organico", label: "Organico" },
  { key: "sponsorizzato", label: "Sponsorizzato" },
  { key: "business", label: "Business" },
] as const;

export default async function KpiPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const rows = await kpisWithStatus([clientId]);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Semaforo rispetto al target: <b>Bene</b> ≥ 90%, <b>Male</b> 60-90%, <b>Troppo male</b> sotto il 60%. Per i costi
        (CPM, CPC, costo per contatto…) più basso è meglio. Le soglie si cambiano per ogni KPI.
      </p>

      {SCOPES.map((scope) => {
        const list = rows.filter((r) => r.scope === scope.key);
        if (list.length === 0) return null;
        return (
          <section key={scope.key} className="space-y-2">
            <h2 className="h-section">{scope.label}</h2>
            <div className="card divide-y divide-line">
              {list.map((k) => (
                <div key={k.id} className="grid items-center gap-3 p-4 md:grid-cols-[1.4fr_1fr_1.6fr]">
                  <div>
                    <p className="font-medium">{k.label}</p>
                    <p className="text-xs text-muted">
                      {k.platform ?? "tutti i canali"} · partenza {fmtMetric(k.baseline, k.unit)} · target{" "}
                      {k.direction === "lower" ? "≤" : "≥"} {fmtMetric(k.target, k.unit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tabular-nums">{fmtMetric(k.latest?.value, k.unit)}</span>
                    <StatusBadge status={k.evaluation.status} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      {k.evaluation.message}
                      {k.latest && ` · ${fmtDate(k.latest.periodStart, { day: "numeric", month: "short" })} – ${fmtDate(k.latest.periodEnd)}`}
                    </p>
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-gold">Aggiungi misura</summary>
                      <form action={addMeasurement} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="kpiId" value={k.id} />
                        <input name="value" required placeholder={k.unit === "%" ? "es. 2,8%" : "valore"} className="field w-28" />
                        <input type="date" name="periodStart" defaultValue={monthStart} className="field w-36" />
                        <input type="date" name="periodEnd" defaultValue={today} className="field w-36" />
                        {k.minSample != null && <input name="sample" placeholder="spesa €" className="field w-24" />}
                        <button className="btn">Salva</button>
                      </form>
                      <form action={deleteKpi} className="mt-2">
                        <input type="hidden" name="kpiId" value={k.id} />
                        <button className="text-xs text-muted hover:text-bad">Disattiva KPI</button>
                      </form>
                    </details>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {rows.length === 0 && <p className="text-sm text-muted">Nessun KPI: definisci il primo qui sotto.</p>}

      <section className="card space-y-3 p-5">
        <h2 className="h-section">Nuovo KPI</h2>
        <form action={addKpi} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="md:col-span-2">
            <label className="label">Metrica</label>
            <select name="metricKey" className="field">
              {SCOPES.map((sc) => (
                <optgroup key={sc.key} label={sc.label}>
                  {METRICS.filter((m) => m.scope === sc.key).map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Nome (facoltativo)</label>
            <input name="label" className="field" placeholder="es. Contatti qualificati da chef" />
          </div>
          <div>
            <label className="label">Canale</label>
            <select name="platform" className="field">
              <option value="">Tutti</option>
              <option>instagram</option><option>facebook</option><option>tiktok</option><option>linkedin</option>
            </select>
          </div>
          <div>
            <label className="label">Target</label>
            <input name="target" required className="field" placeholder="es. 3% o 10" />
          </div>
          <div>
            <label className="label">Punto di partenza</label>
            <input name="baseline" className="field" placeholder="dal check-up" />
          </div>
          <div>
            <label className="label">Spesa minima €</label>
            <input name="minSample" className="field" placeholder="solo ads" />
          </div>
          <div className="flex items-end md:col-span-4">
            <button className="btn">Aggiungi KPI</button>
          </div>
        </form>
      </section>
    </div>
  );
}
