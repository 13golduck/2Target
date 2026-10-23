import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { assertBudget } from "./budget";
import { callClaude, MODELS } from "./claude";
import { clientContext } from "./designer";

// Kit di creazione di un profilo social: i testi da inserire quando si crea (o si completa) la pagina.
// Rispetta i limiti di ogni piattaforma e usa solo i dati del cliente (niente contatti inventati).

export const ProfileKitSchema = z.object({
  displayName: z.string().describe("Nome visualizzato: nome dell'attività, eventualmente + parola chiave (max 30 caratteri per Instagram)"),
  usernames: z.array(z.string()).describe("3 proposte di nome utente, minuscolo, senza spazi, max 30 caratteri"),
  category: z.string().describe("Categoria della pagina/profilo come compare nei menu della piattaforma (in italiano)"),
  bio: z.string().describe("Bio breve: Instagram max 150 caratteri, TikTok max 80; cosa fa, per chi, invito all'azione"),
  about: z.string().describe("Descrizione breve per Facebook/Google: max 255 caratteri"),
  longDescription: z.string().describe("Descrizione estesa (Facebook 'Dettagli', Google Business max 750 caratteri)"),
  actionButton: z.string().describe("Pulsante d'azione consigliato (es. Invia messaggio, Chiama, Prenota, Scopri di più) e perché in poche parole"),
  highlights: z.array(z.string()).describe("Instagram: 4-6 titoli brevi per le storie in evidenza"),
  firstPosts: z
    .array(z.object({ title: z.string(), format: z.string(), idea: z.string() }))
    .describe("3 primi contenuti per non lasciare il profilo vuoto (presentazione, servizio, prova sociale)"),
  hashtags: z.array(z.string()).describe("8-12 hashtag pertinenti, senza #"),
  notes: z.string().describe("Avvertenze: dati mancanti da chiedere al cliente (telefono, indirizzo, orari…)"),
});
export type ProfileKit = z.infer<typeof ProfileKitSchema>;

const LABEL: Record<string, string> = { facebook: "Pagina Facebook", instagram: "profilo Instagram professionale", tiktok: "account TikTok Business", google_business: "profilo dell'attività su Google (Google Business Profile)" };

export async function draftProfileKit(clientId: number, platform: string, current?: string): Promise<ProfileKit> {
  await assertBudget({ clientId, estimateUsd: 0.1 });
  const ctx = await clientContext(clientId);
  const r = await callClaude({
    model: MODELS.sonnet,
    system: [
      {
        type: "text",
        text: `Sei il social media manager di Golduck, agenzia italiana. Prepari i testi per creare o completare i profili social dei clienti.
Regole: italiano chiaro e concreto; rispetta i limiti di caratteri; niente emoji in eccesso (al massimo 2 nella bio);
usa SOLO i dati del cliente forniti: se mancano telefono, indirizzo o orari scrivilo nelle avvertenze invece di inventarli;
nomi utente realistici e disponibili con buona probabilità (varianti con città o mestiere).`,
      },
    ],
    effort: "low",
    maxTokens: 4000,
    outputFormat: betaZodOutputFormat(ProfileKitSchema),
    messages: [
      {
        role: "user",
        content: `${ctx.text}
${current ? `\nProfilo attuale (da migliorare senza stravolgere):\n${current}\n` : ""}
Prepara il kit per il ${LABEL[platform] ?? platform} di ${ctx.client.name}.`,
      },
    ],
    log: { step: `Profili social: kit ${platform}`, clientId },
  });
  return ProfileKitSchema.parse(JSON.parse(r.text));
}
