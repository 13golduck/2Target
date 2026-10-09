# Pubblicazione di 2Target su Plesk

Stesso schema di Will they bite: **si compila su GitHub, il server scarica solo il risultato.**

```
push su main → GitHub Actions (test + build) → branch `production` → Plesk: Git "Estrai ora" → Node.js "Riavvia app"
```

Server: `ct158086.vps.mvmnet.com` (Plesk Obsidian, MariaDB, estensione Node.js). La VPS ha 2 GB di RAM:
mai `next build` sul server.

## Prima configurazione (una volta)

### 1. Dominio e DNS
- Record DNS **A** `2target` → IP della VPS (lo stesso di willtheybite.it, `94.143.158.86`), dove è gestito il DNS
  di golduck.it.
- Plesk → **Siti web e domini → Aggiungi sottodominio** (se golduck.it è su questo Plesk) oppure **Aggiungi dominio**
  `2target.golduck.it`. Document root: `httpdocs/public`.
- **SSL/TLS → Let's Encrypt** sul nuovo dominio (con reindirizzamento HTTPS).

### 2. Database
Plesk → **Database → Aggiungi database**: nome `golduck_marketing`, utente dedicato (es. `gm2t`) con password
robusta generata da Plesk. Annota nome, utente e password (servono per `DATABASE_URL`).

### 3. Git (repository privato)
1. Plesk → dominio 2target → **Git → Aggiungi repository** → *Repository remoto*.
2. URL **`git@github.com:13golduck/2Target.git`** (SSH: serve per i repository privati).
3. Plesk mostra una **chiave SSH pubblica**: copiala.
4. Su GitHub: repository 2Target → **Settings → Deploy keys → Add deploy key**, incolla la chiave, titolo
   "Plesk 2target", **senza** permesso di scrittura.
5. Torna su Plesk e completa: branch **`production`**, percorso di destinazione **`httpdocs`**, deploy **manuale**,
   nessuna azione aggiuntiva. Premi **Estrai ora**.

### 4. Node.js
Plesk → dominio → **Node.js → Abilita**:
- versione Node **22 o superiore**, modalità **production**;
- cartella dell'applicazione **`/httpdocs`**, document root **`/httpdocs/public`**, file di avvio **`server.js`**;
- **variabili d'ambiente** (pulsante "Variabili di ambiente personalizzate"):

| Variabile | Valore |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://UTENTE:PASSWORD@127.0.0.1:3306/golduck_marketing` |
| `AUTH_SECRET` | nuovo, generato con `openssl rand -base64 33` (diverso da quello locale) |
| `AUTH_TRUST_HOST` | `true` |
| `APP_URL` | `https://2target.golduck.it` |
| `ANTHROPIC_API_KEY` | chiave del workspace 2Target (meglio una dedicata, es. `2target-produzione`) |
| `CRON_SECRET` | stringa casuale (`openssl rand -base64 33`) |
| `BOOTSTRAP_ADMIN_EMAIL` | `a.infantino@golduck.it` (solo per il primo avvio) |
| `BOOTSTRAP_ADMIN_NAME` | `Antonio Infantino` (solo per il primo avvio) |
| `BOOTSTRAP_ADMIN_PASSWORD` | password di almeno 12 caratteri (solo per il primo avvio) |

Più avanti, per i canali: `META_APP_ID`, `META_APP_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_PAGESPEED_KEY` (vedi COLLEGAMENTI-API.md).

Se la password del database contiene caratteri speciali (`@ : / ? #`), nella `DATABASE_URL` vanno codificati
(es. `@` → `%40`) oppure si rigenera una password solo con lettere e numeri.

### 5. Primo avvio
1. **NPM install non serve** (le dipendenze sono già nel pacchetto): premi solo **Riavvia app**.
2. All'avvio l'app crea le tabelle e, se la tabella utenti è vuota, l'amministratore `BOOTSTRAP_ADMIN_*`.
3. Apri `https://2target.golduck.it`, accedi.
4. **Togli le tre variabili `BOOTSTRAP_ADMIN_*`** e riavvia l'app.
5. In **Consumi AI** controlla i limiti di spesa.

### 6. Sincronizzazione notturna (canali e KPI)
Plesk → **Operazioni pianificate** → Aggiungi → *Esegui un comando*, ogni giorno alle 05:30:
```
curl -fsS -m 600 -H "Authorization: Bearer IL_TUO_CRON_SECRET" https://2target.golduck.it/api/cron/sync
```

## Aggiornare

1. `git push` su `main` e attendere la spunta verde su GitHub → Actions (2-3 minuti).
2. Plesk → Git → **Estrai ora**, poi Node.js → **Riavvia app**.
3. Se cambia lo schema del database, prima fai un backup del DB da Plesk.

## Note
- I lavori AI lunghi (check-up) girano dentro il processo Node: un **Riavvia app** durante un check-up lo
  interrompe; nella pagina compare «Riprendi».
- Il seed di esempio (`npm run db:seed`) rifiuta di girare su un database non locale.
- `.env.local` non va mai nel repository (è in `.gitignore`).
