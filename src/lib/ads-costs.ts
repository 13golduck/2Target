// Spesa Google Ads per mese, da scrivere nei costi di marketing.
// La finestra letta da Google (circa 90 giorni) di solito inizia a metà mese: quel primo mese è parziale
// e non va riscritto, altrimenti a ogni sincronizzazione perderebbe i giorni rimasti fuori.

export function adsMonthlySpend(daily: { day: string; metric: string; value: number }[], windowStart: string) {
  const firstFull = windowStart.slice(8, 10) === "01" ? windowStart.slice(0, 7) : nextMonth(windowStart.slice(0, 7));
  const byMonth = new Map<string, number>();
  for (const d of daily) {
    if (d.metric !== "ads_spend") continue;
    const m = d.day.slice(0, 7);
    if (m < firstFull) continue;
    byMonth.set(`${m}-01`, (byMonth.get(`${m}-01`) ?? 0) + d.value);
  }
  return byMonth;
}

function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
