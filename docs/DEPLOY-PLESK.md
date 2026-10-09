# Pubblicazione su Plesk

Stesso schema di Will they bite: **si compila su GitHub, il server scarica solo il risultato.**

```
push su main → GitHub Actions (test + build) → branch `production` → Plesk: Git "Estrai ora" → Node.js "Riavvia app"
```

## Prima configurazione (una volta)

1. **Database** — Plesk → Database → Aggiungi database
   - nome `golduck_marketing`, utente dedicato (es. `gm`) con password robusta.
2. **Dominio** — un sottodominio, es. `2target.golduck.it` (record DNS A verso l'IP della VPS),
   certificato Let's Encrypt.
3. **Git** — nel sottodominio: Git → aggiungi repository
   - URL `https://github.com/13golduck/2Target.git` (repository privato: serve un token o una deploy key)
   - branch **`production`**, cartella di destinazione `httpdocs`, nessuna azione di deploy.
4. **Node.js** — nel sottodominio: Node.js → abilita
   - Node 22 o superiore, cartella applicazione `/httpdocs`, file di avvio `server.js`, modalità produzione
   - document root `/httpdocs/public`
   - variabili:

| Variabile | Valore |
|---|---|
| `DATABASE_URL` | `mysql://gm:PASSWORD@127.0.0.1:3306/golduck_marketing` |
| `AUTH_SECRET` | generato con `openssl rand -base64 33` |
| `AUTH_TRUST_HOST` | `true` |
| `NODE_ENV` | `production` |

5. **Riavvia app.** All'avvio l'app crea da sola le tabelle (migrazioni in `drizzle/`, file
   `src/instrumentation.ts`). Per disattivarle: `SKIP_DB_MIGRATIONS=true`.
6. **Primo utente** — dal Mac, con un tunnel SSH verso il database della VPS, oppure dal terminale SSH
   della VPS: `npm run user:create -- email@golduck.it "Nome Cognome" admin`
   (lo script legge `DATABASE_URL` da `.env.local`).

## Aggiornare

1. `git push` su `main` e attendere la spunta verde in GitHub → Actions (2-3 minuti).
2. Plesk → Git → **Estrai ora**, poi Node.js → **Riavvia app**.
3. Se cambia lo schema del database: prima fai un backup del DB da Plesk.

## Note

- La VPS ha 2 GB di RAM: mai `next build` sul server.
- Il seed di esempio (`npm run db:seed`) rifiuta di girare su un database non locale.
- `.env.local` non va mai nel repository (è già in `.gitignore`).
