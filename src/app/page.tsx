import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  // A failure here means the database is unreachable; let /login render so the
  // error surfaces there rather than as an opaque crash on the root route.
  const user = await getCurrentUser().catch(() => null);
  redirect(user ? "/dashboard" : "/login");
}
