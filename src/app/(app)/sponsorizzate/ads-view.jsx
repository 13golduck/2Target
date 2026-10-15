"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import Card from "@mui/material/Card";
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

import { toast } from "src/components/snackbar";
import { Iconify } from "src/components/iconify";
import { askConfirm } from "src/components/custom-dialog";
import { EmptyContent } from "src/components/empty-content";

import { changeSponsorship } from "../ads-actions";
import { CampaignRow } from "../pubblicazioni/[id]/sponsor-panel";

// ----------------------------------------------------------------------
// Tutte le sponsorizzate e, per i clienti in cui paga Golduck, quanto rifatturare nel mese (spesa × ricarico).

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

export function AdsView({ month, dryRun, canPublish, rebill, campaigns }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
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
    const texts = {
      pausa: "Mettere in pausa la sponsorizzata?",
      riprendi: "Riattivare la sponsorizzata?",
      termina: "Terminare la sponsorizzata? Non si potrà riattivare.",
    };
    if (
      !(await askConfirm({
        tone: action === "termina" ? "error" : "warning",
        title: texts[action],
        confirmText: "Conferma",
      }))
    )
      return;
    startBusy(async () => {
      const r = await changeSponsorship(c.id, action);
      if (r.error) toast.error(r.error);
      else router.refresh();
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
        </Stack>
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
                Esporta CSV
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
                      Apri la pubblicazione · spesa del mese {eur(c.monthSpend)}
                    </Link>
                  )}
                </Stack>
              ))
            ) : (
              <EmptyContent
                title="Nessuna sponsorizzata"
                description="Si sponsorizza dalla pagina di una pubblicazione già pubblicata."
                sx={{ py: 5 }}
              />
            )}
          </Stack>
        </Card>
      </Stack>
    </DashboardContent>
  );
}
