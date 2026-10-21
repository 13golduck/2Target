import { describe, expect, it } from "vitest";

import { fromJamendo, fromOpenverse, isUsableLicense, licenseFromUrl, needsCredit } from "./tracks";

describe("licenze", () => {
  it("ammette solo CC0, pubblico dominio e CC BY", () => {
    expect(["cc0", "pdm", "by", "BY"].map(isUsableLicense)).toEqual([true, true, true, true]);
    expect(["by-nc", "by-sa", "by-nd", "by-nc-sa", "sconosciuta"].map(isUsableLicense)).toEqual([false, false, false, false, false]);
  });
  it("legge il codice dall'indirizzo Creative Commons", () => {
    expect(licenseFromUrl("http://creativecommons.org/licenses/by-nc-sa/3.0/")).toBe("by-nc-sa");
    expect(licenseFromUrl("https://creativecommons.org/publicdomain/zero/1.0/")).toBe("cc0");
    expect(licenseFromUrl(undefined)).toBe("sconosciuta");
  });
  it("chiede i crediti solo per CC BY", () => {
    expect([needsCredit("by"), needsCredit("cc0"), needsCredit(null)]).toEqual([true, false, false]);
  });
});

describe("fromOpenverse", () => {
  const base = { id: "a1", title: "Calm piano.mp3", creator: "Anna", url: "https://cdn.example/a1.mp3", license: "by", license_url: "https://creativecommons.org/licenses/by/4.0/", attribution: "«Calm piano» by Anna is licensed under CC BY 4.0.", duration: 125400, source: "jamendo", filetype: "mp3" };
  it("converte un brano utilizzabile, con durata in secondi e crediti", () => {
    expect(fromOpenverse({ ...base, license_version: "4.0" })).toMatchObject({
      provider: "openverse",
      title: "Calm piano",
      durationSec: 125.4,
      license: "by",
      credit: "Musica: «Calm piano» di Anna · CC BY 4.0 (creativecommons.org/licenses/by/4.0/)",
    });
  });
  it("scarta licenze non commerciali e formati non MP3", () => {
    expect(fromOpenverse({ ...base, license: "by-nc" })).toBeNull();
    expect(fromOpenverse({ ...base, filetype: "wav" })).toBeNull();
    expect(fromOpenverse({ ...base, filetype: "mp32" })).not.toBeNull();
  });
});

describe("fromJamendo", () => {
  const base = { id: 7, name: "Sunrise", artist_name: "Luca", duration: 180, audio: "https://j/stream", audiodownload: "https://j/dl", audiodownload_allowed: true, license_ccurl: "http://creativecommons.org/licenses/by/3.0/", shareurl: "https://j/7" };
  it("converte un brano scaricabile con licenza CC BY", () => {
    expect(fromJamendo(base)).toMatchObject({ provider: "jamendo", id: "7", license: "by", downloadUrl: "https://j/dl" });
  });
  it("scarta brani non scaricabili o con licenza non adatta", () => {
    expect(fromJamendo({ ...base, audiodownload_allowed: false })).toBeNull();
    expect(fromJamendo({ ...base, license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/" })).toBeNull();
  });
});
