import "server-only";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public expired = false,
  ) {
    super(message);
  }
}

/** fetch JSON con messaggio d'errore leggibile (Meta e Google rispondono con { error: … }). */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number; status?: string } | string; error_description?: string })?.error;
    const msg =
      typeof err === "string"
        ? `${err}${(body as { error_description?: string }).error_description ? `: ${(body as { error_description?: string }).error_description}` : ""}`
        : err?.message ?? `HTTP ${res.status}`;
    // Meta: codice 190 = token scaduto o revocato; Google: invalid_grant / 401
    const expired = (typeof err === "object" && err?.code === 190) || err === "invalid_grant" || res.status === 401;
    throw new ApiError(msg, res.status, expired);
  }
  return body as T;
}

export const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
