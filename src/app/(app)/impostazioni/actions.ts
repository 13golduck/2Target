"use server";

import { revalidatePath } from "next/cache";

import { headers } from "next/headers";

import { requireUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/roles";
import { DEFAULT_LIMITS, getLimits, saveLimits } from "@/lib/ai/budget";
import { audit } from "@/lib/audit";
import { FIELDS, saveIntegrationKeys } from "@/lib/integrations/keys";
import { appUrl } from "@/lib/integrations/config";
import { DEFAULT_METHOD, DEFAULT_PLAN_METHOD, planMethod, saveMethodology } from "@/lib/ai/metodologia";
import { consumeLoginCode, requestLoginCode } from "@/lib/login-codes";
import { grantSettingsAccess, revokeSettingsAccess, settingsUnlocked } from "@/lib/settings-access";
import { EMPTY_MAIL, explainMailError, isMailConfigured, type MailPreset, saveMailSettings, saveMailTest, sendMail } from "@/lib/mail";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const LOCKED = { error: "Accesso alle Impostazioni scaduto: ricarica la pagina e inserisci un nuovo codice." };

async function adminEmail() {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return null;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, me.id)).limit(1);
  return { id: me.id, email: u.email };
}

/** Invia il codice per entrare in Impostazioni all'email dell'amministratore collegato. */
export async function requestSettingsCode() {
  const me = await adminEmail();
  if (!me) return { error: "Solo un amministratore può entrare in Impostazioni" };
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  try {
    const sent = await requestLoginCode(me.email, ip, "settings");
    if (!sent) return { error: "Hai chiesto troppi codici: riprova tra 15 minuti." };
    await audit({ userId: me.id, category: "impostazioni", action: "impostazioni.codice_richiesto", description: `Richiesto il codice per entrare in Impostazioni (inviato a ${me.email})` });
  } catch (e) {
    return { error: explainMailError(e) };
  }
  return { ok: true, email: me.email };
}

/** Verifica il codice: se è giusto sblocca le Impostazioni per qualche minuto. */
export async function verifySettingsCode(f: FormData) {
  const me = await adminEmail();
  if (!me) return { error: "Solo un amministratore può entrare in Impostazioni" };
  const user = await consumeLoginCode(me.email, str(f, "code"), "settings");
  if (!user || user.id !== me.id) {
    await audit({ userId: me.id, category: "impostazioni", action: "impostazioni.codice_errato", description: "Codice errato per entrare in Impostazioni" });
    return { error: "Codice non valido o scaduto. Controlla o chiedine uno nuovo." };
  }
  await grantSettingsAccess(me.id);
  await audit({ userId: me.id, category: "impostazioni", action: "impostazioni.sblocco", description: "Entrato in Impostazioni con il codice email" });
  revalidatePath("/impostazioni");
  return { ok: true };
}

/** Richiude subito le Impostazioni. */
export async function lockSettings() {
  const me = await requireUser();
  await revokeSettingsAccess();
  await audit({ userId: me.id, category: "impostazioni", action: "impostazioni.chiuse", description: "Uscito da Impostazioni" });
  revalidatePath("/impostazioni");
}

export async function saveMail(f: FormData) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può cambiare l'invio email" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  // Primo salvataggio (email non ancora configurata): resta dentro per poter inviare la prova
  const firstSetup = !(await isMailConfigured());
  const presets: MailPreset[] = ["microsoft", "microsoft-smtp", "google", "google-relay", "smtp"];
  const preset = presets.find((p) => p === str(f, "preset")) ?? "microsoft";
  const provider = preset === "microsoft" ? "microsoft" : "smtp";
  const from = str(f, "from").toLowerCase();
  if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return { error: "Indirizzo mittente non valido" };
  if (preset === "google-relay" && !from) return { error: "Con il relay di Google serve la casella mittente (un indirizzo del vostro dominio Workspace)" };
  const port = Number(str(f, "port")) || EMPTY_MAIL.port;
  await saveMailSettings(
    {
      provider,
      preset,
      from,
      fromName: str(f, "fromName") || "2Target",
      tenantId: str(f, "tenantId"),
      clientId: str(f, "clientId"),
      clientSecret: str(f, "clientSecret"),
      host: str(f, "host"),
      port,
      user: str(f, "user").toLowerCase(),
      pass: str(f, "pass"),
    },
    me.id,
  );
  if (firstSetup) await grantSettingsAccess(me.id);
  // Solo i dati non segreti: le credenziali non finiscono mai nell'audit
  await audit({
    userId: me.id,
    category: "impostazioni",
    action: "email.configurazione",
    description: `Modificato l'invio email (${preset}, mittente ${from || "—"})${str(f, "pass") || str(f, "clientSecret") ? ": credenziali aggiornate" : ""}`,
    meta: { preset, host: str(f, "host") || null, port, user: str(f, "user").toLowerCase() || null },
  });
  revalidatePath("/impostazioni");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Invia un'email di prova all'utente collegato. */
export async function testMail() {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, me.id)).limit(1);
  try {
    await sendMail(
      u.email,
      "Prova di invio da 2Target",
      `Ciao ${u.name}, l'invio delle email di 2Target funziona. Da ora l'accesso avviene con il codice via email.`,
      `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><p style="font-size:16px">Ciao ${u.name.replace(/[<>&]/g, "")},</p><p style="font-size:16px">l'invio delle email di <b>2Target</b> funziona. Da ora l'accesso avviene con il codice via email.</p><p style="color:#919EAB;font-size:12px">2Target · powered by Golduck</p></div>`,
    );
    await saveMailTest({ ok: true, at: new Date().toISOString(), to: u.email }, me.id);
    await audit({ userId: me.id, category: "impostazioni", action: "email.prova", description: `Email di prova inviata a ${u.email}` });
    revalidatePath("/impostazioni");
    return { ok: true, to: u.email };
  } catch (e) {
    const error = explainMailError(e);
    await saveMailTest({ ok: false, at: new Date().toISOString(), error }, me.id);
    await audit({ userId: me.id, category: "impostazioni", action: "email.prova", description: `Email di prova non riuscita: ${error}` });
    revalidatePath("/impostazioni");
    return { error };
  }
}

// --- Limiti di spesa AI --------------------------------------------------------

const num = (f: FormData, k: string, fallback: number) => {
  const v = Number(String(f.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export async function updateLimits(f: FormData) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può cambiare i limiti" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const limits = {
    enabled: f.get("enabled") === "on",
    monthlyEur: num(f, "monthlyEur", DEFAULT_LIMITS.monthlyEur),
    warnPct: Math.min(1, num(f, "warnPct", DEFAULT_LIMITS.warnPct * 100) / 100),
    checkupEur: num(f, "checkupEur", DEFAULT_LIMITS.checkupEur),
    clientMonthlyEur: num(f, "clientMonthlyEur", DEFAULT_LIMITS.clientMonthlyEur),
    maxConcurrent: Math.max(1, Math.round(num(f, "maxConcurrent", DEFAULT_LIMITS.maxConcurrent))),
    maxCheckupsPerDay: Math.max(1, Math.round(num(f, "maxCheckupsPerDay", DEFAULT_LIMITS.maxCheckupsPerDay))),
    // Ricarico sul listino Anthropic: almeno 1 (nessun ricarico), al massimo 10
    markup: Math.min(10, Math.max(1, num(f, "markup", DEFAULT_LIMITS.markup))),
  };
  const before = await getLimits();
  await saveLimits(limits, me.id);
  await audit({ userId: me.id, category: "impostazioni", action: "ai.limiti", description: "Modificati i limiti di spesa AI", meta: { prima: before, dopo: limits } });
  revalidatePath("/impostazioni");
  revalidatePath("/consumi-ai");
  return { ok: true };
}

// --- Metodologia del check-up --------------------------------------------------

export async function updateMethodology(f: FormData) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può cambiare la metodologia" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const plan = f.get("kind") === "piano";
  const text = f.get("reset") === "1" ? (plan ? DEFAULT_PLAN_METHOD : DEFAULT_METHOD) : String(f.get("text") ?? "");
  if (text.trim().length < 200) return { error: "La metodologia è troppo corta: almeno qualche paragrafo" };
  if (text.length > 30_000) return { error: "La metodologia è troppo lunga (massimo 30.000 caratteri)" };
  const version = plan ? await planMethod.save(text, me.id) : await saveMethodology(text, me.id);
  const what = plan ? "del piano editoriale" : "del check-up";
  await audit({ userId: me.id, category: "impostazioni", action: plan ? "metodologia_piano.versione" : "metodologia.versione", description: f.get("reset") === "1" ? `Metodologia ${what} riportata al testo Golduck originale (versione ${version})` : `Salvata la metodologia ${what}, versione ${version}` });
  revalidatePath("/impostazioni");
  return { ok: true, version };
}

// --- Integrazioni (Meta, Google) -----------------------------------------------

export async function saveIntegrations(f: FormData) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può cambiare le integrazioni" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const input: Record<string, string> = {};
  for (const field of FIELDS) {
    if (field === "publishLiveHost") continue; // ha il suo interruttore
    const v = f.get(field);
    if (v !== null) input[field] = String(v);
  }
  const clear = FIELDS.filter((field) => field !== "publishLiveHost" && f.get(`clear:${field}`) === "1");
  if (input.metaAppId && !/^\d{6,25}$/.test(input.metaAppId.trim())) return { error: "L'ID app di Meta è fatto solo di cifre" };
  if (input.metaConfigId && !/^\d{6,25}$/.test(input.metaConfigId.trim())) return { error: "L'ID configurazione di Meta è fatto solo di cifre" };
  if (input.threadsAppId && !/^\d{6,25}$/.test(input.threadsAppId.trim())) return { error: "L'ID app di Threads è fatto solo di cifre" };
  if (input.pinterestAppId && !/^\d{4,25}$/.test(input.pinterestAppId.trim())) return { error: "L'App ID di Pinterest è fatto solo di cifre" };
  if (input.googleYoutubeUpload && !["true", "false"].includes(input.googleYoutubeUpload.trim())) return { error: "Per YouTube Shorts scrivi «true» (attivo) oppure lascia vuoto" };
  if (input.googleClientId && !/\.apps\.googleusercontent\.com$/.test(input.googleClientId.trim())) return { error: "L'ID client di Google finisce con .apps.googleusercontent.com" };
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (input.msTenantId && !guid.test(input.msTenantId.trim())) return { error: "L'ID directory (tenant) di Microsoft ha la forma xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" };
  if (input.msClientId && !guid.test(input.msClientId.trim())) return { error: "L'ID applicazione (client) di Microsoft ha la forma xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" };
  const changed = await saveIntegrationKeys(input, clear, me.id);
  // Solo i nomi dei campi cambiati: mai i valori
  if (changed.length) await audit({ userId: me.id, category: "impostazioni", action: "integrazioni.chiavi", description: `Aggiornate le chiavi delle integrazioni: ${changed.join(", ")}`, meta: { campi: changed } });
  revalidatePath("/impostazioni");
  return { ok: true, changed: changed.length };
}

/** Accende o spegne la pubblicazione reale sui social, legandola al dominio attuale. */
export async function setPublishingLive(on: boolean) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può attivare la pubblicazione reale" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const host = new URL(appUrl()).host;
  await saveIntegrationKeys(on ? { publishLiveHost: host } : {}, on ? [] : ["publishLiveHost"], me.id);
  await audit({
    userId: me.id,
    category: "impostazioni",
    action: on ? "pubblicazione.reale_attiva" : "pubblicazione.reale_spenta",
    description: on ? `Pubblicazione reale sui social ATTIVATA per ${host}` : "Pubblicazione reale sui social spenta: da ora solo simulazione",
  });
  revalidatePath("/impostazioni");
  return { ok: true };
}

/** Backup del database subito (oltre a quello notturno). */
export async function runBackupNow() {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può eseguire il backup" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const { runBackup } = await import("@/lib/system/backup");
  const r = await runBackup("manuale", me.id);
  revalidatePath("/impostazioni");
  return r.ok ? { ok: true, bytes: r.bytes } : { error: `Backup non riuscito: ${r.error}` };
}

/** Funzioni accese e spente per tutti (le voci spente spariscono dai menu). */
export async function saveFeatures(values: unknown) {
  const me = await requireUser();
  if (!isAdminRole(me.role)) return { error: "Solo un amministratore può cambiare le funzioni" };
  if (!(await settingsUnlocked(me.id))) return LOCKED;
  const { cleanFlags, FEATURES } = await import("@/lib/features");
  const { saveGlobalFeatures } = await import("@/lib/features-data");
  const flags = cleanFlags(values);
  // Si salvano solo gli spegnimenti: una funzione nuova nasce accesa
  const off = Object.fromEntries(FEATURES.filter((f) => flags[f.key] === false).map((f) => [f.key, false]));
  await saveGlobalFeatures(off, me.id);
  const names = FEATURES.filter((f) => f.key in off).map((f) => f.label);
  await audit({ userId: me.id, category: "impostazioni", action: "funzioni.generali", description: names.length ? `Funzioni spente per tutti: ${names.join(", ")}` : "Tutte le funzioni accese" });
  revalidatePath("/", "layout");
  return { ok: true };
}
