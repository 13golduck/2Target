import { describe, expect, it } from "vitest";

import { backupDate, backupName, backupsToDelete, healthChecks, type HealthFacts } from "./health";

const now = new Date("2026-10-19T10:00:00Z");
const minAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const good: HealthFacts = {
  now,
  uptimeMs: 3_600_000,
  schedulerBeat: minAgo(1),
  syncLastRun: minAgo(8 * 60),
  backup: { lastOkAt: minAgo(9 * 60), lastError: null, lastErrorAt: null, count: 7 },
  overduePublications: 0,
  errorsLastHour: 0,
  diskFreeBytes: 50 * 1024 ** 3,
  mediaWritable: true,
};
const level = (f: HealthFacts, key: string) => healthChecks(f).find((c) => c.key === key)?.level;

describe("healthChecks", () => {
  it("tutto verde", () => {
    expect(healthChecks(good).every((c) => c.level === "ok")).toBe(true);
  });
  it("scheduler fermo, ma non subito dopo l'avvio", () => {
    expect(level({ ...good, schedulerBeat: minAgo(30) }, "scheduler")).toBe("errore");
    expect(level({ ...good, schedulerBeat: null, uptimeMs: 60_000 }, "scheduler")).toBe("ok");
  });
  it("backup fallito dopo l'ultimo riuscito, o troppo vecchio", () => {
    expect(level({ ...good, backup: { ...good.backup, lastError: "disco pieno", lastErrorAt: minAgo(10) } }, "backup")).toBe("errore");
    expect(level({ ...good, backup: { ...good.backup, lastError: "vecchio", lastErrorAt: minAgo(3000) } }, "backup")).toBe("ok");
    expect(level({ ...good, backup: { ...good.backup, lastOkAt: minAgo(40 * 60) } }, "backup")).toBe("attenzione");
  });
  it("coda in ritardo, sincronizzazione saltata, errori e disco", () => {
    expect(level({ ...good, overduePublications: 2 }, "coda")).toBe("errore");
    expect(level({ ...good, syncLastRun: minAgo(31 * 60) }, "sync")).toBe("attenzione");
    expect(level({ ...good, errorsLastHour: 25 }, "errori")).toBe("attenzione");
    expect(level({ ...good, diskFreeBytes: 1024 ** 3 }, "disco")).toBe("attenzione");
    expect(level({ ...good, diskFreeBytes: 100 * 1024 ** 2 }, "disco")).toBe("errore");
    expect(level({ ...good, mediaWritable: false }, "disco")).toBe("errore");
  });
});

describe("rotazione dei backup", () => {
  it("nome e data si corrispondono", () => {
    const d = new Date("2026-10-19T02:05:00Z");
    expect(backupDate(backupName(d))?.toISOString()).toBe(d.toISOString());
    expect(backupDate("altro.sql.gz")).toBeNull();
  });
  it("tiene 7 giorni, 4 settimane e 6 mesi; non tocca file estranei", () => {
    // Un backup al giorno per 400 giorni, più un secondo backup oggi e un file estraneo
    const names = Array.from({ length: 400 }, (_, i) => backupName(new Date(Date.UTC(2026, 9, 19, 2) - i * 86_400_000)));
    names.push(backupName(new Date(Date.UTC(2026, 9, 19, 9))), "appunti.txt");
    const drop = backupsToDelete(names);
    const kept = names.filter((n) => !drop.includes(n) && n !== "appunti.txt");
    expect(drop).not.toContain("appunti.txt");
    // Oggi si tiene il più recente dei due
    expect(kept).toContain(backupName(new Date(Date.UTC(2026, 9, 19, 9))));
    expect(kept).not.toContain(backupName(new Date(Date.UTC(2026, 9, 19, 2))));
    expect(kept.length).toBeLessThanOrEqual(7 + 4 + 6);
    expect(kept.length).toBeGreaterThanOrEqual(12);
    // Il più vecchio conservato non va oltre 6 mesi
    const oldest = Math.min(...kept.map((n) => backupDate(n)!.getTime()));
    expect(now.getTime() - oldest).toBeLessThan(200 * 86_400_000);
  });
});
