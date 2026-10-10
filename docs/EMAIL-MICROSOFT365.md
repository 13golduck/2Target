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
1. **Riavvia app** su Plesk.
2. Entro **60 minuti** dal riavvio apri <https://2target.it>: la pagina chiede di creare l'account master con la
   sola email. Entri senza codice (solo se nessuno è mai entrato e l'email non è configurata).
3. Si apre **Impostazioni**: servizio *Microsoft 365*, casella mittente, ID tenant, ID applicazione, segreto client → **Salva**.
4. **Invia email di prova**: deve arrivarti un'email. Se c'è un errore, il messaggio di Microsoft dice cosa manca
   (di solito il consenso amministratore su `Mail.Send`).
5. Da qui in poi si entra con il codice via email.

Il segreto si salva cifrato nel database. Quando scade (24 mesi) se ne crea uno nuovo in Entra e si aggiorna
in Impostazioni.

## Alternativa: SMTP (preimpostazioni pronte)
In Impostazioni → *Servizio di posta*:
- **Microsoft 365 – SMTP con password**: `smtp.office365.com:587`. La casella deve avere *SMTP autenticato* attivo
  (Microsoft 365 admin → Utenti attivi → casella → Posta → Gestisci app di posta elettronica). Con MFA serve una
  password per app. Microsoft lo disattiva per impostazione predefinita da fine 2026.
- **Google Workspace / Gmail**: `smtp.gmail.com:587`, utente = indirizzo completo, password = **password per app**
  (Verifica in due passaggi attiva → <https://myaccount.google.com/apppasswords>).
- **Altro server SMTP**: server e porta a mano.

Errori comuni (la prova li spiega in italiano): `535 5.7.8` Google rifiuta la password → serve la password per app;
`535 5.7.3` Microsoft rifiuta utente/password; `5.7.139` SMTP autenticato disattivato sulla casella.
