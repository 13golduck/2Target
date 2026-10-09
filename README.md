# 2Target

Piattaforma interna del team Golduck per il servizio marketing di ogni cliente:
check-up → strategia e KPI → brainstorming → piano editoriale → (poi) pubblicazione e sponsorizzate.

Stack: Next.js 16 · MariaDB 10.11 · Drizzle · Auth.js · interfaccia Minimal (MUI 7, FullCalendar, ApexCharts).
Accesso solo per gli utenti del team.

## Avvio in locale

Serve Docker Desktop aperto. La prima volta:

```bash
npm install
cp .env.example .env.local   # poi compila AUTH_SECRET
npm run db:up                # MariaDB in Docker sulla porta 3308
npm run db:migrate           # crea le tabelle
npm run db:seed              # dati di esempio Piantiny e Lesioli + utente di prova admin / admin
npm run dev                  # http://localhost:3070
```

Le volte successive bastano `npm run db:up` e `npm run dev`.
Per creare un utente vero: `npm run user:create -- email@golduck.it "Nome Cognome" admin`.

## Cosa c'è

| Sezione | Contenuto |
|---|---|
| Clienti | elenco con semaforo complessivo (vince il KPI peggiore) |
| KPI | organico, sponsorizzato, business; target, punto di partenza, misure per periodo |
| Check-up | le 8 sezioni del modello Piantiny con domande guida |
| Idee | bacheca kanban con trascinamento: idea → in sviluppo → approvata → nel piano (crea la scheda), con voti |
| Piano editoriale | calendario (mese, settimana, elenco) con spostamento delle date trascinando; brief, quote per formato, cadenza, budget ads, controlli automatici |
| Lead | raccoglitore per cliente (moduli del sito via indirizzo dedicato, inserimento manuale), pipeline trascinabile, costi di marketing, costo per lead, costo di acquisizione, conversione, ricavi, ROI e ROAS, per fonte e per mese |
| SEO | Search Console (clic, impressioni, CTR, posizione, ricerche e pagine), Analytics 4 per canale, PageSpeed |
| Canali | collegamento Meta e Google per cliente, sincronizzazione, ultimi post con statistiche; guida in docs/COLLEGAMENTI-API.md |
| Scheda pubblicazione | hook, layout, script, clip da girare, caption, hashtag, CTA e destinazione, produzione, sponsorizzata |

Semaforo: **Bene** ≥ 90% del target · **Male** 60-90% · **Troppo male** < 60% (per i costi il rapporto si inverte).

## Struttura

- `src/db/schema.ts` — tabelle; `drizzle/` — migrazioni (`npm run db:generate` dopo ogni modifica allo schema)
- `src/lib/kpi.ts`, `kpi-catalog.ts` — semaforo e metriche
- `src/lib/editorial-plan.ts` — controlli del piano (quote, cadenza, budget, schede incomplete)
- `src/lib/checkup-template.ts` — sezioni del check-up
- `src/app/(app)/` — pagine (server) + viste `*-view.jsx` (client, MUI); `actions.ts` — salvataggi
- `src/theme`, `src/components`, `src/layouts` — dal kit Minimal, ripuliti (colori Golduck, italiano)

## Pubblicazione

Vedi [docs/DEPLOY-PLESK.md](docs/DEPLOY-PLESK.md): push su `main` → GitHub Actions → branch `production` → Plesk.

## Prossimi passi

1. Export Word del piano editoriale e PDF del check-up
2. Persona, competitor e obiettivi modificabili dall'interfaccia
3. Bozze AI (idee, script, caption)
4. Lettura dati Meta/TikTok e pubblicazione (richiede app review)
