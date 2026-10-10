import { describe, expect, it } from "vitest";

import { ASSIGNABLE_ROLES, canWrite, isAdminRole, isViewer } from "../roles";

describe("ruoli", () => {
  it("solo super admin e administrator gestiscono utenti e impostazioni", () => {
    expect(isAdminRole("superadmin")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("viewer")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("il viewer è in sola lettura, gli altri scrivono", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(isViewer("viewer")).toBe(true);
    for (const r of ["superadmin", "admin", "user"]) expect(canWrite(r)).toBe(true);
    expect(canWrite("consulente")).toBe(false); // ruolo vecchio: nessun permesso finché non migrato
  });

  it("il super admin non si può assegnare dall'interfaccia", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("superadmin");
  });
});
