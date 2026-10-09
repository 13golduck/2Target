"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Accesso…" : "Entra"}
      </button>
    </form>
  );
}
