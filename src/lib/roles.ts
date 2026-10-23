// Ruoli di 2Target, dal più alto al più basso.
// - superadmin: il titolare. Uno solo, non può essere modificato, disattivato o declassato da nessun altro.
// - admin: gestisce utenti, impostazioni e limiti AI.
// - user: operatore che lavora sui clienti (check-up, piano, pubblicazioni, lead...).
// - viewer: il cliente; vede solo i propri clienti, in sola lettura (KPI, SEO, lead).

export const ROLES = ["superadmin", "admin", "user", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super admin",
  admin: "Administrator",
  user: "User",
  viewer: "Viewer",
};

export const ROLE_HINTS: Record<Role, string> = {
  superadmin: "Titolare: tutti i permessi, non modificabile da altri",
  admin: "Gestisce utenti, impostazioni e limiti AI",
  user: "Operatore: lavora sui clienti",
  viewer: "Cliente: vede grafici e risultati dei suoi clienti, in sola lettura",
};

/** Ruoli che un amministratore può assegnare (il super admin non si assegna). */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "user", "viewer"];

export const isAdminRole = (r: string | null | undefined) => r === "superadmin" || r === "admin";
export const canWrite = (r: string | null | undefined) => r === "superadmin" || r === "admin" || r === "user";
export const isViewer = (r: string | null | undefined) => r === "viewer";

/** Sezioni del cliente visibili a un Viewer. */
export const VIEWER_SECTIONS = ["", "seo", "lead"] as const;

/** Può programmare e pubblicare sui profili dei clienti: Super admin e Administrator sempre, gli User se abilitati. */
export const canPublishWith = (r: string | null | undefined, canPublish: boolean | null | undefined) => isAdminRole(r) || (r === "user" && !!canPublish);
