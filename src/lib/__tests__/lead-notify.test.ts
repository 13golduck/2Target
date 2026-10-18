import { describe, expect, it } from "vitest";

import { leadEmail, SUMMARY_FROM } from "../lead-notify";

const lead = (o: Partial<Parameters<typeof leadEmail>[1][number]> = {}) => ({ name: "Mario Rossi", email: "mario@esempio.it", phone: "+39 333 1234567", company: null, message: "Vorrei un preventivo per il bagno", source: "meta_ads", ...o });

describe("email di nuovo lead", () => {
  it("un contatto: dettagli, fonte, link e telefono cliccabile", () => {
    const m = leadEmail("Lesioli", [lead()], "https://2target.it/clienti/10/lead");
    expect(m.subject).toBe("Nuovo contatto per Lesioli: Mario Rossi");
    expect(m.text).toContain("Telefono: +39 333 1234567");
    expect(m.text).toContain("Fonte: Inserzioni Meta");
    expect(m.text).toContain("Vorrei un preventivo per il bagno");
    expect(m.html).toContain('href="tel:+393331234567"');
    expect(m.html).toContain('href="mailto:mario@esempio.it"');
  });

  it("senza nome usa email o telefono e protegge l'HTML", () => {
    const m = leadEmail("Lesioli", [lead({ name: null, message: "<script>x</script>" })], "l");
    expect(m.subject).toContain("mario@esempio.it");
    expect(m.html).not.toContain("<script>");
  });

  it(`da ${SUMMARY_FROM} contatti in su: un solo riepilogo`, () => {
    const list = Array.from({ length: SUMMARY_FROM }, (_, i) => lead({ name: `Persona ${i}` }));
    const m = leadEmail("Lesioli", list, "l");
    expect(m.subject).toBe(`${SUMMARY_FROM} nuovi contatti per Lesioli`);
    expect(m.text.match(/• /g)).toHaveLength(SUMMARY_FROM);
  });
});
