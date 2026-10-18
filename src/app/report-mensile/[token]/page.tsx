import { notFound } from "next/navigation";

import { monthlyReportData, reportFromToken } from "@/lib/monthly-report";
import { MonthlyReportView } from "./monthly-view";

// Report mensile del cliente: pagina pubblica con link firmato (120 giorni), stampabile in PDF (A4)
// e con il video verticale del mese da scaricare. Nessun accesso richiesto: vale solo il link.

export const metadata = { title: "Report del mese", robots: { index: false, follow: false } };

export default async function MonthlyReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = reportFromToken(token);
  if (!ref) notFound();
  const r = await monthlyReportData(ref.clientId, ref.month).catch(() => null);
  if (!r) notFound();
  return (
    <MonthlyReportView
      token={token}
      report={{
        ...r,
        posts: r.posts.map((p) => ({ ...p, at: p.at.toISOString() })),
        best: r.best ? { ...r.best, at: r.best.at.toISOString() } : null,
      }}
    />
  );
}
