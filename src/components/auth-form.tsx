"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  mode: "login" | "register";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Show the escape hatch to the database-free email tests. */
  probeEnabled?: boolean;
};

const copy = {
  login: {
    title: "Sign in",
    submit: "Sign in",
    hint: "No account yet?",
    linkLabel: "Create one",
    href: "/register",
  },
  register: {
    title: "Create an account",
    submit: "Create account",
    hint: "Already registered?",
    linkLabel: "Sign in",
    href: "/login",
  },
} as const;

export function AuthForm({ mode, action, probeEnabled = false }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const t = copy[mode];

  // A connection failure here means the database is down, not that the user
  // typed something wrong — point them at the tests that still work.
  const looksLikeDbFailure = /timeout|ECONN|connect|terminated|database/i.test(state.error ?? "");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-[--color-border] bg-[--color-surface] p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Test harness for database and email delivery. Use a throwaway address.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-md border border-[--color-border] bg-white px-3 py-2 text-sm outline-none focus:border-[--color-accent] focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
              className="w-full rounded-md border border-[--color-border] bg-white px-3 py-2 text-sm outline-none focus:border-[--color-accent] focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {state.error && (
            <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{state.error}</p>
              {looksLikeDbFailure && (
                <p className="mt-1 text-xs">
                  This looks like the database, not your details.{" "}
                  {probeEnabled ? (
                    <Link href="/probe" className="font-medium underline">
                      Test email without it
                    </Link>
                  ) : (
                    <>
                      Check <code className="font-mono">/api/health</code>.
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {pending ? "Working…" : t.submit}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[--color-muted]">
          {t.hint}{" "}
          <Link href={t.href} className="font-medium text-[--color-accent] hover:underline">
            {t.linkLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
