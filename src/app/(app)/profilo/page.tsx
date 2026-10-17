import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, isViewer, type Role } from "@/lib/roles";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profilo e sicurezza" };

export default async function ProfilePage() {
  const me = await requireUser();
  const [u] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  return (
    <ProfileView
      user={{
        name: u.name,
        email: u.email,
        role: ROLE_LABELS[u.role as Role] ?? u.role,
        totpEnabledAt: u.totpEnabledAt?.toISOString() ?? null,
        recoveryLeft: u.totpRecovery?.length ?? 0,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        // Il riepilogo settimanale è per il team Golduck, non per i clienti (Viewer)
        weeklyDigest: isViewer(u.role) ? null : u.weeklyDigest,
      }}
    />
  );
}
