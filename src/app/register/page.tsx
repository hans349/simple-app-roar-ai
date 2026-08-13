import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { probeEnabled } from "@/lib/probe";

export default async function RegisterPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");

  return <AuthForm mode="register" action={registerAction} probeEnabled={probeEnabled()} />;
}
