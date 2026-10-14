import { NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { appUrl, META } from "@/lib/integrations/config";
import { ensureIntegrationKeys } from "@/lib/integrations/keys";
import { confirmationCode, deleteMetaUserData, parseSignedRequest } from "@/lib/integrations/meta-deletion";

// Meta → «URL di callback per l'eliminazione dei dati». Risposta richiesta da Meta: { url, confirmation_code }.
export async function POST(request: Request) {
  await ensureIntegrationKeys();
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") ?? ""), META.appSecret);
  if (!data?.user_id) return NextResponse.json({ error: "signed_request non valido" }, { status: 400 });

  const code = confirmationCode();
  const r = await deleteMetaUserData(String(data.user_id));
  await audit({
    userId: null,
    actorLabel: "Meta",
    category: "canali",
    action: "meta.eliminazione_dati",
    description: `Richiesta di eliminazione dati da Meta (codice ${code}): ${r.connections ? `cancellati ${r.connections} collegamenti e i dati di ${r.channels} canali` : "nessun dato collegato a questo utente"}`,
    clientId: r.clientIds[0] ?? null,
    meta: { codice: code, collegamenti: r.connections, canali: r.channels, clienti: r.clientIds },
  });
  return NextResponse.json({ url: `${appUrl(request)}/eliminazione-dati?codice=${code}`, confirmation_code: code });
}
