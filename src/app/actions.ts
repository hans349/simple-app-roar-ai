"use server";

import { redirect } from "next/navigation";
import { createSession, createUser, destroySession, findUserByEmail, verifyPassword } from "@/lib/auth";
import { parseEmail, parsePassword } from "@/lib/validation";

export type FormState = { error: string | null };

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = parseEmail(formData.get("email"), "email");
  if (!email.ok) return { error: email.error };

  const password = parsePassword(formData.get("password"));
  if (!password.ok) return { error: password.error };

  try {
    const existing = await findUserByEmail(email.value);
    if (existing) return { error: "An account with that email already exists" };

    const user = await createUser(email.value, password.value);
    await createSession(user.id);
  } catch (err) {
    // Unique-violation: someone registered the same address between our check
    // and the insert.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      return { error: "An account with that email already exists" };
    }
    return { error: err instanceof Error ? err.message : "Registration failed" };
  }

  redirect("/dashboard");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = parseEmail(formData.get("email"), "email");
  if (!email.ok) return { error: email.error };

  const rawPassword = formData.get("password");
  if (typeof rawPassword !== "string" || rawPassword === "") {
    return { error: "password is required" };
  }

  try {
    const user = await findUserByEmail(email.value);
    // Same message either way, so this cannot be used to enumerate accounts.
    if (!user || !(await verifyPassword(rawPassword, user.password_hash))) {
      return { error: "Incorrect email or password" };
    }
    await createSession(user.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Sign in failed" };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
