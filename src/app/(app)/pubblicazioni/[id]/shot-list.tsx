"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ShotListEntry } from "@/db/schema";

const SOURCES = { cliente: "Gira il cliente", golduck: "Giriamo noi", ai: "Immagine AI", stock: "Stock" };

export function ShotList({ initial }: { initial: ShotListEntry[] }) {
  const [rows, setRows] = useState(initial.length ? initial : [{ scena: "", fonte: "cliente" as const }]);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[1.2fr_2fr_90px_150px_auto]">
          <input name="shot_scena" defaultValue={r.scena} placeholder={`Scena ${i + 1}`} className="field" />
          <input name="shot_descrizione" defaultValue={r.descrizione ?? ""} placeholder="Cosa si vede" className="field" />
          <input name="shot_durata" defaultValue={r.durata_s ?? ""} placeholder="sec." className="field" />
          <select name="shot_fonte" defaultValue={r.fonte} className="field">
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" onClick={() => setRows(rows.filter((_, n) => n !== i))} className="btn-ghost justify-center" title="Togli scena">
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { scena: "", fonte: "cliente" }])} className="btn-ghost">
        <Plus size={14} /> Aggiungi scena
      </button>
    </div>
  );
}
