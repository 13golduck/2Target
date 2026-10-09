"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";

export async function login(_prev: string | null, formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "/");
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return "Email o password non corretti.";
    throw e; // il redirect di Next passa da qui
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
