# Invio email con Microsoft 365

2Target invia i codici di accesso con **Microsoft Graph**: un'app registrata in Microsoft Entra con il permesso
`Mail.Send`. Non serve la password della casella e non dipende dall'SMTP con password semplice, che Microsoft
disattiva in modo predefinito da fine dicembre 2026.

## 1. Registrare l'app (una volta, amministratore di Microsoft 365)
1. <https://entra.microsoft.com> → **Identità → Applicazioni → Registrazioni app → Nuova registrazione**.
2. Nome `2Target`, tipo di account: **Solo questa directory organizzativa**. Nessun URI di reindirizzamento. **Registra**.
3. Dalla pagina **Panoramica** annota **ID applicazione (client)** e **ID della directory (tenant)**.
4. **Autorizzazioni API → Aggiungi un'autorizzazione → Microsoft Graph → Autorizzazioni applicazione** →
   cerca `Mail.Send` → **Aggiungi**. Poi **Concedi consenso amministratore per Golduck**.
5. **Certificati e segreti → Nuovo segreto client** → descrizione `2Target`, scadenza 24 mesi → **Aggiungi**.
   Copia subito la colonna **Valore** (dopo non si vede più).

Consigliato: una casella dedicata (es. `noreply@golduck.it`, anche una cassetta condivisa senza licenza).
Per limitare l'app a quella sola casella: Exchange Online PowerShell, `New-ApplicationAccessPolicy` (o RBAC for Applications).

## 2. Configurare 2Target (primo accesso)
1. Su Plesk deve esserci `BOOTSTRAP_ADMIN_EMAIL` con la tua email. **Riavvia app**.
2. Entro **60 minuti** dal riavvio apri <https://2target.it>, scrivi quell'email: entri senza codice
   (solo la prima volta, solo se nessuno è mai entrato e l'email non è configurata).
3. Si apre **Impostazioni**: servizio *Microsoft 365*, casella mittente, ID tenant, ID applicazione, segreto client → **Salva**.
4. **Invia email di prova**: deve arrivarti un'email. Se c'è un errore, il messaggio di Microsoft dice cosa manca
   (di solito il consenso amministratore su `Mail.Send`).
5. Da qui in poi si entra con il codice via email. Togli `BOOTSTRAP_ADMIN_*` da Plesk.

Il segreto si salva cifrato nel database. Quando scade (24 mesi) se ne crea uno nuovo in Entra e si aggiorna
in Impostazioni.

## Alternativa: SMTP
In Impostazioni si può scegliere *Server SMTP* (es. Google Workspace `smtp.gmail.com`, porta 587, con
password per app). Le variabili `SMTP_*` su Plesk restano supportate ma non servono più.
