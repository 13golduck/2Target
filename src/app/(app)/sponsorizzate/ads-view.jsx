"use client";

import { SPONSOR_ACTION_TEXT } from "./sponsor-texts";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import TableRow from "@mui/material/TableRow";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TextField from "@mui/material/TextField";
import CardHeader from "@mui/material/CardHeader";
import Typography from "@mui/material/Typography";

import { DashboardContent } from "src/layouts/dashboard";

import { Label } from "src/components/label";
import { Chart, useChart } from "src/components/chart";

import { toast } from "src/components/snackbar";
import { Iconify } from "src/components/iconify";
import { askConfirm } from "src/components/custom-dialog";
import { EmptyContent } from "src/components/empty-content";

import { changeSponsorship } from "../ads-actions";
import { NewCampaignDialog } from "./new-campaign-dialog";
import { CampaignRow } from "../pubblicazioni/[id]/sponsor-panel";

// ----------------------------------------------------------------------
// Cruscotto delle sponsorizzate: indicatori del mese, consigli, spesa giorno per giorno, tutte le campagne e,
// per i clienti in cui paga Golduck, quanto rifatturare nel mese (spesa × ricarico).

const eur = (n) =>
  (n ?? 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const ADVICE_STYLE = {
  attenzione: { color: "warning", icon: "solar:danger-triangle-bold", label: "Attenzione" },
  opportunita: { color: "success", icon: "solar:graph-up-bold", label: "Opportunità" },
  info: { color: "info", icon: "solar:info-circle-bold", label: "Da sapere" },
};

export function AdsView({ month, dryRun, canPublish, kpi, advice, daily, adClients, rebill, campaigns }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [creating, setCreating] = useState(false);
  const [y, m] = month.split("-").map(Number);
  const label = `${MONTHS[m - 1]} ${y}`;
  const total = rebill.reduce(
    (t, r) => ({ spend: t.spend + r.spend, invoice: t.invoice + r.invoice }),
    { spend: 0, invoice: 0 },
  );

  const exportCsv = () => {
    const n = (v) => v.toFixed(2).replace(".", ",");
    const rows = [
      [
        "Cliente",
        "Sponsorizzate",
        "Spesa Meta (€)",
        "Ricarico",
        "Da fatturare (€)",
      ],
      ...rebill.map((r) => [
        r.clientName,
        r.campaigns,
        n(r.spend),
        n(r.markup),
        n(r.invoice),
      ]),
      ["Totale", "", n(total.spend), "", n(total.invoice)],
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `rifatturazione-sponsorizzate-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const act = async (c, action) => {
    const text = SPONSOR_ACTION_TEXT[action];
    if (!(await askConfirm(text))) return;
    startBusy(async () => {
      const r = await changeSponsorship(c.id, action);
      if (r.error) toast.error(r.error);
      else {
        toast.success(text.done);
        router.refresh();
      }
    });
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={3}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="h4" sx={{ flex: 1 }}>
            Sponsorizzate
          </Typography>
          <TextField
            type="month"
            size="small"
            label="Mese"
            value={month}
            onChange={(e) =>
              e.target.value &&
              router.push(`/sponsorizzate?mese=${e.target.value}`)
            }
          />
          {canPublish && (
            <Button
              variant="contained"
              startIcon={<Iconify icon="mingcute:add-line" />}
              disabled={!adClients.length}
              onClick={() => setCreating(true)}
            >
              Nuova sponsorizzata
            </Button>
          )}
        </Stack>
        {canPublish && !adClients.length && (
          <Alert severity="info">
            Per creare una campagna scegli prima l&apos;account pubblicitario
            del cliente in Canali → Sponsorizzate.
          </Alert>
        )}

        <Kpis kpi={kpi} />

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <AdvicePanel advice={advice} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <SpendChart daily={daily} label={label} />
          </Grid>
        </Grid>
        {dryRun && (
          <Alert severity="info">
            Modalità simulazione: le sponsorizzate simulate non spendono e non
            entrano nella rifatturazione.
          </Alert>
        )}

        <Card>
          <CardHeader
            title={`Da rifatturare · ${label}`}
            subheader="Clienti in cui paga Golduck: spesa letta da Meta (in euro) × ricarico del cliente"
            action={
              <Button
                size="small"
                startIcon={<Iconify icon="solar:export-bold" />}
                onClick={exportCsv}
                disabled={!rebill.length}
              >
                Scarica per Excel
              </Button>
            }
          />
          {rebill.length ? (
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Cliente</TableCell>
                  <TableCell align="right">Sponsorizzate</TableCell>
                  <TableCell align="right">Spesa Meta</TableCell>
                  <TableCell align="right">Ricarico</TableCell>
                  <TableCell align="right">Da fatturare</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rebill.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell>
                      <Link href={`/clienti/${r.clientId}/canali`}>
                        {r.clientName}
                      </Link>
                    </TableCell>
                    <TableCell align="right">{r.campaigns}</TableCell>
                    <TableCell align="right">{eur(r.spend)}</TableCell>
                    <TableCell align="right">
                      ×{r.markup.toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell align="right">
                      <strong>{eur(r.invoice)}</strong>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell>
                    <strong>Totale</strong>
                  </TableCell>
                  <TableCell />
                  <TableCell align="right">
                    <strong>{eur(total.spend)}</strong>
                  </TableCell>
                  <TableCell />
                  <TableCell align="right">
                    <strong>{eur(total.invoice)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <EmptyContent
              title="Niente da rifatturare"
              description={`Nessuna spesa a carico di Golduck in ${label}.`}
              sx={{ py: 5 }}
            />
          )}
          <Typography
            variant="caption"
            component="p"
            sx={{ color: "text.secondary", p: 2 }}
          >
            Meta consolida la spesa con qualche giorno di ritardo: per il mese
            appena chiuso conviene esportare dopo il 3 del mese successivo.
          </Typography>
        </Card>

        <Card>
          <CardHeader
            title="Sponsorizzate del mese"
            subheader="Attive, in pausa, partite o con spesa nel mese"
          />
          <Stack spacing={2} divider={<Divider />} sx={{ p: 3 }}>
            {campaigns.length ? (
              campaigns.map((c) => (
                <Stack key={c.id} spacing={0.5}>
                  <CampaignRow
                    c={c}
                    canPublish={canPublish}
                    busy={busy}
                    onAction={act}
                    showClient
                  />
                  {c.itemId && (
                    <Link variant="caption" href={`/pubblicazioni/${c.itemId}`}>
                      Apri la scheda · spesa del mese {eur(c.monthSpend)}
                    </Link>
                  )}
                </Stack>
              ))
            ) : (
              <EmptyContent
                title="Nessuna sponsorizzata"
                description="Crea una sponsorizzata con «Nuova sponsorizzata», oppure sponsorizza un post dalla pagina della pubblicazione."
                sx={{ py: 5 }}
              />
            )}
          </Stack>
        </Card>
      </Stack>
      {creating && (
        <NewCampaignDialog
          clients={adClients}
          onClose={() => setCreating(false)}
          onDone={() => router.refresh()}
        />
      )}
    </DashboardContent>
  );
}

// ----------------------------------------------------------------------

function Kpis({ kpi }) {
  const items = [
    { label: "Spesa del mese", value: eur(kpi.spend), icon: "solar:wad-of-money-bold", color: "warning" },
    { label: "Campagne attive", value: kpi.active, icon: "carbon:rocket", color: "info" },
    { label: "Contatti da Meta", value: kpi.leads, icon: "solar:user-plus-bold", color: "success" },
    { label: "Costo per contatto", value: kpi.costPerLead == null ? "—" : eur(kpi.costPerLead), icon: "solar:tag-price-bold", color: "secondary" },
    { label: "% di clic", value: kpi.ctr == null ? "—" : `${kpi.ctr.toLocaleString("it-IT")}%`, icon: "solar:cursor-bold", color: "primary" },
    { label: "Costo per clic", value: kpi.cpc == null ? "—" : eur(kpi.cpc), icon: "solar:hand-money-bold", color: "error" },
    { label: "Ricavi dalle campagne", value: eur(kpi.revenue), icon: "solar:graph-up-bold", color: "success" },
    { label: "Resa: € incassati per € spesi", value: kpi.roas == null ? "—" : kpi.roas.toLocaleString("it-IT", { maximumFractionDigits: 1 }), icon: "solar:chart-2-bold", color: "warning" },
  ];
  return (
    <Grid container spacing={2}>
      {items.map((k) => (
        <Grid key={k.label} size={{ xs: 6, md: 3 }}>
          <Card sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: `${k.color}.lighter`, color: `${k.color}.dark`, flexShrink: 0 }}>
              <Iconify icon={k.icon} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" noWrap>{k.value}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>{k.label}</Typography>
            </Box>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

function AdvicePanel({ advice }) {
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader title="Consigli" subheader="Letti dai numeri di Meta delle campagne attive e dai Lead" />
      {advice.length ? (
        <Stack spacing={1.5} sx={{ p: 3, pt: 2, maxHeight: 420, overflow: "auto" }}>
          {advice.map((a) => {
            const st = ADVICE_STYLE[a.level];
            return (
              <Stack key={a.key} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                <Iconify icon={st.icon} sx={{ color: `${st.color}.main`, mt: 0.25, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle2">{a.title}</Typography>
                    <Label variant="soft" color={st.color}>{st.label}</Label>
                  </Stack>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>{a.detail}</Typography>
                  <Link variant="caption" href={a.key.startsWith("lead-") ? `/clienti/${a.clientId}/lead` : `/clienti/${a.clientId}/canali`}>
                    {a.clientName} →
                  </Link>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      ) : (
        <EmptyContent title="Nessun consiglio" description="Le campagne attive non mostrano problemi. I consigli si aggiornano con l’aggiornamento di ogni notte o con «Aggiorna»." sx={{ py: 5 }} />
      )}
    </Card>
  );
}

function SpendChart({ daily, label }) {
  const options = useChart({
    colors: ["#CDA434"],
    xaxis: { categories: daily.map((d) => Number(d.day.slice(8))) },
    yaxis: { labels: { formatter: (v) => `${Math.round(v)} €` } },
    tooltip: { y: { formatter: (v) => eur(v) } },
    plotOptions: { bar: { columnWidth: "60%" } },
  });
  return (
    <Card sx={{ height: 1 }}>
      <CardHeader title="Spesa giorno per giorno" subheader={label} />
      {daily.length ? (
        <Box sx={{ p: 2 }}>
          <Chart type="bar" series={[{ name: "Spesa", data: daily.map((d) => d.eur) }]} options={options} sx={{ height: 280 }} />
        </Box>
      ) : (
        <EmptyContent title="Nessuna spesa" description="Ancora nessuna spesa letta da Meta in questo mese." sx={{ py: 5 }} />
      )}
    </Card>
  );
}
