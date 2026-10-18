// Consigli sulle sponsorizzate: regole semplici e spiegabili sui numeri letti da Meta (nessun costo di AI).
// Funzione pura: riceve i dati già letti e restituisce i consigli ordinati per importanza.

export type AdviceLevel = "attenzione" | "opportunita" | "info";
export type Advice = { key: string; level: AdviceLevel; clientId: number; campaignId?: number; title: string; detail: string };

export type AdviceCampaign = {
  id: number;
  clientId: number;
  name: string;
  objective: string;
  status: string;
  budget: number;
  spend: number;
  startAt: Date;
  endAt: Date;
  simulated: boolean;
  results: Record<string, number> | null;
};

export type AdviceClient = { id: number; name: string; monthlyCap: number | null; spentMonth: number; committed: number; leadsWaiting: number };

// Soglie (documentate qui perché sono il cuore dei consigli)
/** Oltre questa frequenza media la stessa persona ha visto l'inserzione troppe volte. */
export const SATURATION_FREQUENCY = 3.5;
/** CTR sotto lo 0,8% su almeno 2.000 impressioni: la creatività non convince. */
export const LOW_CTR = 0.008;
export const MIN_IMPRESSIONS_FOR_CTR = 2000;
/** Speso almeno il 30% del budget senza alcun risultato. */
export const NO_RESULT_SPEND_SHARE = 0.3;
/** Dopo 2 giorni, se ha speso meno della metà di quanto previsto dal calendario. */
export const UNDERSPEND_MIN_DAYS = 2;
export const UNDERSPEND_RATIO = 0.5;
/** Tetto mensile del cliente usato oltre l'80%. */
export const CAP_WARNING_SHARE = 0.8;
/** Una campagna costa almeno il doppio per risultato rispetto alla migliore dello stesso cliente e obiettivo. */
export const COST_GAP = 2;
/** In scadenza entro 2 giorni. */
export const ENDING_DAYS = 2;

const DAY = 86_400_000;
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

/** Risultato principale per obiettivo: è quello su cui si giudica la campagna. */
export function mainResult(objective: string, r: Record<string, number> | null) {
  const v = r ?? {};
  switch (objective) {
    case "contatti":
      return { label: "contatto", value: v.contatti ?? 0 };
    case "traffico":
      return { label: "clic sul link", value: v.clic_link ?? 0 };
    case "notorieta":
      return { label: "persona raggiunta", value: v.copertura ?? 0 };
    default:
      return { label: "interazione", value: v.interazioni ?? 0 };
  }
}

const costPerResult = (c: AdviceCampaign) => {
  const m = mainResult(c.objective, c.results);
  return m.value > 0 ? c.spend / m.value : null;
};

export function buildAdvice(campaigns: AdviceCampaign[], clients: AdviceClient[], now = new Date()): Advice[] {
  const out: Advice[] = [];
  const real = campaigns.filter((c) => !c.simulated);
  const active = real.filter((c) => c.status === "attiva");

  for (const c of active) {
    const r = c.results ?? {};
    const elapsed = Math.max(0, (now.getTime() - c.startAt.getTime()) / DAY);
    const total = Math.max(1, (c.endAt.getTime() - c.startAt.getTime()) / DAY);
    const m = mainResult(c.objective, c.results);

    if ((r.frequenza ?? 0) >= SATURATION_FREQUENCY) {
      out.push({
        key: `saturo-${c.id}`,
        level: "attenzione",
        clientId: c.clientId,
        campaignId: c.id,
        title: `«${c.name}»: pubblico saturo`,
        detail: `Le stesse persone l'hanno vista in media ${r.frequenza.toLocaleString("it-IT")} volte. Cambia foto o testo, oppure allarga zona ed età: altrimenti il costo sale.`,
      });
    }

    const impressions = r.impressioni ?? 0;
    const clicks = c.objective === "traffico" ? (r.clic_link ?? 0) : (r.clic ?? 0);
    if (c.objective !== "notorieta" && impressions >= MIN_IMPRESSIONS_FOR_CTR && clicks / impressions < LOW_CTR) {
      out.push({
        key: `ctr-${c.id}`,
        level: "attenzione",
        clientId: c.clientId,
        campaignId: c.id,
        title: `«${c.name}»: pochi clic`,
        detail: `Clic sulle visualizzazioni: ${((clicks / impressions) * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}% (sotto lo 0,8%). Prova una foto più chiara, un titolo con il beneficio o un'offerta concreta.`,
      });
    }

    if (c.budget > 0 && c.spend >= c.budget * NO_RESULT_SPEND_SHARE && m.value === 0) {
      out.push({
        key: `zero-${c.id}`,
        level: "attenzione",
        clientId: c.clientId,
        campaignId: c.id,
        title: `«${c.name}»: spende senza risultati`,
        detail:
          c.objective === "contatti"
            ? `Spesi ${eur(c.spend)} e nessun contatto. Controlla il modulo (troppe domande?) e che l'offerta sia chiara; valuta di metterla in pausa.`
            : `Spesi ${eur(c.spend)} e nessun ${m.label}. Controlla link e pulsante; valuta di metterla in pausa.`,
      });
    }

    const expected = c.budget * Math.min(1, elapsed / total);
    if (elapsed >= UNDERSPEND_MIN_DAYS && expected > 0 && c.spend < expected * UNDERSPEND_RATIO) {
      out.push({
        key: `lenta-${c.id}`,
        level: "attenzione",
        clientId: c.clientId,
        campaignId: c.id,
        title: `«${c.name}»: spende poco`,
        detail: `Ha speso ${eur(c.spend)} contro i circa ${eur(expected)} previsti a questo punto. Di solito il pubblico è troppo ristretto (zona o età) o l'inserzione è stata limitata da Meta.`,
      });
    }

    const daysLeft = (c.endAt.getTime() - now.getTime()) / DAY;
    const cpr = costPerResult(c);
    const peers = real.filter((p) => p.clientId === c.clientId && p.objective === c.objective && costPerResult(p) != null);
    const median = (() => {
      const xs = peers.map((p) => costPerResult(p)!).sort((a, b) => a - b);
      return xs.length ? xs[Math.floor(xs.length / 2)] : null;
    })();
    if (daysLeft > 0 && daysLeft <= ENDING_DAYS && cpr != null && (median == null || cpr <= median)) {
      out.push({
        key: `proroga-${c.id}`,
        level: "opportunita",
        clientId: c.clientId,
        campaignId: c.id,
        title: `«${c.name}»: finisce tra poco e rende bene`,
        detail: `Costa ${eur(cpr)} per ${m.label}. Valuta di prolungarla o di rilanciarla con lo stesso contenuto.`,
      });
    }
  }

  // Dove spostare il budget: stessa attività, stesso obiettivo, una costa almeno il doppio della migliore
  const byGroup = new Map<string, AdviceCampaign[]>();
  for (const c of active) {
    if (costPerResult(c) == null) continue;
    const k = `${c.clientId}|${c.objective}`;
    byGroup.set(k, [...(byGroup.get(k) ?? []), c]);
  }
  for (const group of byGroup.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => costPerResult(a)! - costPerResult(b)!);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (costPerResult(worst)! >= costPerResult(best)! * COST_GAP) {
      const m = mainResult(best.objective, best.results);
      out.push({
        key: `sposta-${worst.id}-${best.id}`,
        level: "opportunita",
        clientId: best.clientId,
        campaignId: best.id,
        title: `Sposta budget su «${best.name}»`,
        detail: `«${best.name}» costa ${eur(costPerResult(best)!)} per ${m.label}, «${worst.name}» ${eur(costPerResult(worst)!)}. Metti in pausa la seconda o riduci il suo budget.`,
      });
    }
  }

  for (const cl of clients) {
    if (cl.monthlyCap != null && cl.monthlyCap > 0 && cl.spentMonth + cl.committed >= cl.monthlyCap * CAP_WARNING_SHARE) {
      out.push({
        key: `tetto-${cl.id}`,
        level: "info",
        clientId: cl.id,
        title: `${cl.name}: tetto mensile quasi raggiunto`,
        detail: `Spesi ${eur(cl.spentMonth)} e impegnati ${eur(cl.committed)} su ${eur(cl.monthlyCap)}. Le nuove campagne oltre il tetto vengono bloccate.`,
      });
    }
    if (cl.leadsWaiting > 0) {
      out.push({
        key: `lead-${cl.id}`,
        level: "attenzione",
        clientId: cl.id,
        title: `${cl.name}: ${cl.leadsWaiting} ${cl.leadsWaiting === 1 ? "contatto" : "contatti"} da richiamare`,
        detail: "Arrivati dai moduli di Meta da più di un giorno e ancora «nuovi». Chi richiama entro poche ore chiude molto di più.",
      });
    }
  }

  const rank: Record<AdviceLevel, number> = { attenzione: 0, opportunita: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
