"use client";

import { useState } from "react";

export function PaidToggle({ defaultChecked, children }: { defaultChecked: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <section className={`card p-5 ${on ? "border-gold" : ""}`}>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="isPaid" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span className="h-section">Sponsorizzata</span>
      </label>
      {/* I campi restano nel DOM anche se nascosti: il server li ignora quando la casella è spenta */}
      <div className={`mt-4 grid gap-4 md:grid-cols-2 ${on ? "" : "hidden"}`}>{children}</div>
    </section>
  );
}
