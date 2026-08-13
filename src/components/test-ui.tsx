"use client";

/** Shared form furniture for the test pages, so both look and behave alike. */

export type Result = { ok: boolean; message: string; detail?: string } | null;

export const inputClass =
  "w-full rounded-md border border-[--color-border] bg-white px-3 py-2 text-sm outline-none focus:border-[--color-accent] focus:ring-2 focus:ring-indigo-100";

export function Card({
  step,
  title,
  description,
  disabled,
  children,
}: {
  step: number | string;
  title: string;
  description: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-[--color-border] bg-[--color-surface] p-5 shadow-sm ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
            disabled ? "bg-zinc-400" : "bg-[--color-accent]"
          }`}
        >
          {step}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-[--color-muted]">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function ResultBanner({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className={`rounded-md px-3 py-2 text-sm ${
        result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      <p className="font-medium">{result.message}</p>
      {result.detail && <p className="mt-0.5 font-mono text-xs opacity-80">{result.detail}</p>}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  label = "Sending…",
}: {
  pending: boolean;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[--color-accent] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
    >
      {pending ? label : children}
    </button>
  );
}

export async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
