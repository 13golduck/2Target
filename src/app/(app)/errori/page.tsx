import { redirect } from "next/navigation";

// Il Registro errori è confluito nell'audit trail (registro unico): i vecchi link portano agli errori.
export default function ErrorsPage() {
  redirect("/audit?categoria=errori");
}
