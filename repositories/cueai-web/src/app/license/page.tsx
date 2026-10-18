import { redirect } from "next/navigation";

/** Desktop licensing is disabled. Send leftover /license links into the app. */
export default function LicensePage() {
  redirect("/dashboard");
}
