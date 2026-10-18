import { describe, expect, it } from "vitest";

import { failureEmail, publishedEmail } from "./notify";

describe("email di esito", () => {
  const base = { title: "Cantiere <via Roma>", clientName: "Lesioli", platform: "instagram", handle: "lesioli", when: new Date("2026-11-03T17:30:00Z"), link: "https://2target.it/pubblicazioni/21" };

  it("errore: oggetto, motivo, link e testo HTML sicuro", () => {
    const m = failureEmail({ ...base, error: "Il reel richiede un video" });
    expect(m.subject).toBe("Non pubblicato: «Cantiere <via Roma>» su Instagram @lesioli");
    expect(m.text).toContain("Motivo: Il reel richiede un video");
    expect(m.text).toContain("https://2target.it/pubblicazioni/21");
    expect(m.text).toContain("martedì 3 novembre");
    expect(m.html).toContain("Cantiere &lt;via Roma&gt;");
    expect(m.html).not.toContain("<via Roma>");
  });

  it("esito incerto: lo dice nell'oggetto", () => {
    expect(failureEmail({ ...base, error: "ESITO INCERTO: connessione interrotta" }).subject).toMatch(/^Esito incerto/);
  });

  it("uscita: link al post e prima riga del testo", () => {
    const m = publishedEmail({ title: "Demolizioni", clientName: "Lesioli", platform: "facebook", permalink: "https://facebook.com/p/1", caption: "Prima settimana di cantiere\n\n#ristrutturazione" });
    expect(m.subject).toBe("È uscito il tuo nuovo post su Facebook");
    expect(m.text).toContain("Guardalo qui: https://facebook.com/p/1");
    expect(m.text).toContain("«Prima settimana di cantiere»");
    expect(m.html).toContain('href="https://facebook.com/p/1"');
  });

  it("uscita senza link: niente pulsante", () => {
    expect(publishedEmail({ title: "X", clientName: "Y", platform: "tiktok", permalink: null, caption: null }).html).not.toContain("Guarda il post");
  });
});
