"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { DEFAULT_LIMITS, saveLimits } from "@/lib/ai/budget";

const num = (f: FormData, k: string, fallback: number) => {
  const v = Number(String(f.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export async function updateLimits(f: FormData) {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Solo un amministratore può cambiare i limiti" };
  const limits = {
    enabled: f.get("enabled") === "on",
    monthlyUsd: num(f, "monthlyUsd", DEFAULT_LIMITS.monthlyUsd),
    warnPct: Math.min(1, num(f, "warnPct", DEFAULT_LIMITS.warnPct * 100) / 100),
    checkupUsd: num(f, "checkupUsd", DEFAULT_LIMITS.checkupUsd),
    clientMonthlyUsd: num(f, "clientMonthlyUsd", DEFAULT_LIMITS.clientMonthlyUsd),
    maxConcurrent: Math.max(1, Math.round(num(f, "maxConcurrent", DEFAULT_LIMITS.maxConcurrent))),
    maxCheckupsPerDay: Math.max(1, Math.round(num(f, "maxCheckupsPerDay", DEFAULT_LIMITS.maxCheckupsPerDay))),
  };
  await saveLimits(limits, user.id);
  revalidatePath("/consumi-ai");
  return { ok: true };
}
