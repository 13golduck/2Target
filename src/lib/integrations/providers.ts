import "server-only";

import type { Provider } from "./config";
import * as google from "./google";
import * as instagram from "./instagram";
import * as linkedin from "./linkedin";
import * as meta from "./meta";
import * as pinterest from "./pinterest";
import * as threads from "./threads";
import * as tiktok from "./tiktok";

// Registro dei fornitori di accesso: un punto solo per avvio del collegamento, ritorno e scelta dei canali.
// Aggiungere una piattaforma = aggiungere qui il suo modulo (con authorizeUrl, exchangeCode, listAssets).

export type Grant = { accessToken: string; refreshToken?: string | null; expiresAt: Date; scopes?: string; externalUserId: string; accountName: string };
export type Asset = { kind: string; externalId: string; handle: string; name: string; pictureUrl?: string };

type ProviderModule = {
  label: string;
  authorizeUrl: (state: string, request?: Request) => string;
  exchangeCode: (code: string, request?: Request) => Promise<Grant>;
  listAssets: (token: string) => Promise<Asset[]>;
};

export const PROVIDER_MODULES: Record<Provider, ProviderModule> = {
  meta: { label: "Meta", ...meta },
  google: { label: "Google", ...google },
  tiktok: { label: "TikTok", ...tiktok },
  instagram: { label: "Instagram", ...instagram },
  linkedin: { label: "LinkedIn", ...linkedin },
  threads: { label: "Threads", ...threads },
  pinterest: { label: "Pinterest", ...pinterest },
};

export const isProvider = (p: string): p is Provider => Object.hasOwn(PROVIDER_MODULES, p);

export const providerLabel = (p: string) => (isProvider(p) ? PROVIDER_MODULES[p].label : p);
