// Date e numeri in formato italiano, sempre con il fuso di Roma (il server su Plesk può essere in UTC).

const TZ = "Europe/Rome";

export const fmtDate = (d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  d ? new Date(d).toLocaleDateString("it-IT", { timeZone: TZ, ...opts }) : "—";

export const fmtDateTime = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("it-IT", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Da programmare";

/** Scostamento di Roma da UTC (minuti) in un certo istante. */
function romeOffsetMinutes(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Date → valore per <input type="datetime-local"> in ora di Roma. */
export function toRomeInput(d: Date | null | undefined) {
  if (!d) return "";
  const local = new Date(d.getTime() + romeOffsetMinutes(d) * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Valore di <input type="datetime-local"> (ora di Roma) → Date. */
export function fromRomeInput(v: string | null | undefined) {
  if (!v) return null;
  const naive = new Date(`${v}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - romeOffsetMinutes(naive) * 60_000);
}

export function fmtMetric(value: number | null | undefined, unit: string) {
  if (value == null) return "—";
  if (unit === "%") return `${(value * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
  if (unit === "€") return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  if (unit === "x") return `${value.toLocaleString("it-IT", { maximumFractionDigits: 2 })}×`;
  return value.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

/** "3%" o "0,03" → 0.03 per i KPI in percentuale; numeri italiani con la virgola. */
export function parseMetricInput(raw: FormDataEntryValue | null, unit: string) {
  const s = String(raw ?? "").trim().replace(/\./g, "").replace(",", ".").replace("%", "").replace("€", "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return unit === "%" && (String(raw).includes("%") || n > 1) ? n / 100 : n;
}

/** Data (AAAA-MM-GG, UTC) di n giorni fa: per i filtri sui dati giornalieri. */
export const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
