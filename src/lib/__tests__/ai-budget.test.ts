import { describe, expect, it } from "vitest";
import { budgetViolation, DEFAULT_LIMITS } from "../ai/budget";

const L = { ...DEFAULT_LIMITS, monthlyUsd: 50, checkupUsd: 8, clientMonthlyUsd: 15 };

describe("blocchi di spesa AI", () => {
  it("lascia passare sotto i limiti", () => {
    expect(budgetViolation(L, { month: 10, client: 3, checkup: 2 }, 1.5)).toBeNull();
  });
  it("blocca se la fase farebbe superare il budget mensile", () => {
    expect(budgetViolation(L, { month: 49 }, 2)).toMatch(/Budget AI del mese/);
    expect(budgetViolation(L, { month: 50 })).toMatch(/Budget AI del mese/);
  });
  it("blocca per tetto cliente e tetto check-up", () => {
    expect(budgetViolation(L, { month: 1, client: 14.5 }, 1)).toMatch(/cliente/);
    expect(budgetViolation(L, { month: 1, checkup: 7.5 }, 1)).toMatch(/check-up/);
  });
  it("tetto cliente 0 = nessun tetto; interruttore spento = tutto bloccato", () => {
    expect(budgetViolation({ ...L, clientMonthlyUsd: 0 }, { month: 1, client: 999 })).toBeNull();
    expect(budgetViolation({ ...L, enabled: false }, { month: 0 })).toMatch(/disattivata/);
  });
});
