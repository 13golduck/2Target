import { eq } from "drizzle-orm";

import { db } from "@/db";
import { PROFILE_PLATFORMS, profileSetups, socialAccounts } from "@/db/schema";
import { requireClientAccess, userCanPublish } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/claude";
import { ProfiliView } from "./profili-view";

export const metadata = { title: "Profili" };

// Profili social del cliente: completare quelli collegati (controllo di completezza + correzioni dove Meta lo consente)
// e creare da zero quelli mancanti con il kit preparato dall'AI. Una scheda per piattaforma.

export default async function ProfiliPage({ params }: { params: Promise<{ id: string }> }) {
  const clientId = Number((await params).id);
  const me = await requireClientAccess(clientId);
  const canConnect = await userCanPublish(me);

  const channels = await db.select().from(socialAccounts).where(eq(socialAccounts.clientId, clientId));
  const setups = await db.select().from(profileSetups).where(eq(profileSetups.clientId, clientId));

  // Una piattaforma «profilo» è coperta da un canale social collegato (facebook/instagram/tiktok) o,
  // per Google, dalla scheda Business Profile. Qui interessa sapere se esiste e se è collegato per leggere i dati.
  const CHANNEL_FOR: Record<string, string> = { facebook: "facebook", instagram: "instagram", tiktok: "tiktok", google_business: "business_profile" };

  const platforms = PROFILE_PLATFORMS.map((platform) => {
    const ch = channels.find((c) => c.platform === CHANNEL_FOR[platform]);
    const setup = setups.find((s) => s.platform === platform);
    return {
      platform,
      channel: ch ? { id: ch.id, name: ch.name ?? ch.handle, handle: ch.handle, connected: ch.connected, hasToken: !!ch.assetTokenEnc } : null,
      health: setup?.health ?? null,
      kit: setup?.kit ?? null,
      steps: setup?.steps ?? {},
      updatedAt: setup?.updatedAt?.toISOString() ?? null,
    };
  });

  return <ProfiliView clientId={clientId} canConnect={canConnect} aiReady={isAiConfigured()} platforms={platforms} />;
}
