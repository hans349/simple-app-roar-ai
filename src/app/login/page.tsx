import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/dashboard");

  return <AuthForm mode="login" action={loginAction} />;
}
