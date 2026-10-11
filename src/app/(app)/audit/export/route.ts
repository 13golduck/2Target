import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseAuditFilters, queryAudit } from "@/lib/audit-query";
import { isAdminRole } from "@/lib/roles";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Esportazione CSV dell'audit trail (stessi filtri e stesse regole di visibilità della pagina). Anche l'esportazione viene registrata.

const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Niente formule quando il file si apre in Excel
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(request: Request) {
  const id = Number((await auth())?.user?.id);
  const [me] = id ? await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, id)).limit(1) : [];
  if (!me?.active) return new Response("Non autorizzato", { status: 403 });

  const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
  // Chi non è amministratore esporta solo le proprie voci
  const rows = await queryAudit(filters, 20_000, isAdminRole(me.role) ? undefined : id);
  await audit({ userId: id, category: "sistema", action: "audit.esportato", description: `Esportato l'audit trail in CSV (${rows.length} voci, ultimi ${filters.days} giorni)` });

  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "medium" });
  const lines = [
    ["Data e ora", "Chi", "Categoria", "Azione", "Descrizione", "Cliente", "Oggetto", "Pagina", "IP", "Browser", "Dettagli"].map(cell).join(";"),
    ...rows.map((r) =>
      [fmt.format(r.createdAt), r.actor ?? "Sistema", r.category, r.action, r.description, r.clientName ?? "", r.target ?? "", r.path ?? "", r.ip ?? "", r.userAgent ?? "", r.meta ?? ""].map(cell).join(";"),
    ),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="audit-2target-${day}.csv"`, "Cache-Control": "no-store" },
  });
}
