"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOREM_IPSUM } from "@/lib/templates";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

type Result = { ok: boolean; message: string; detail?: string } | null;

const inputClass =
  "w-full rounded-md border border-[--color-border] bg-white px-3 py-2 text-sm outline-none focus:border-[--color-accent] focus:ring-2 focus:ring-indigo-100";

function Card({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[--color-border] bg-[--color-surface] p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[--color-accent] text-xs font-semibold text-white">
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

function ResultBanner({ result }: { result: Result }) {
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

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[--color-accent] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
    >
      {pending ? "Sending…" : children}
    </button>
  );
}

/** Turn any API response into something the banner can show. */
async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/* -------------------------------------------------------------------------- */
/* Test 1 — recipient and body chosen by the user                              */
/* -------------------------------------------------------------------------- */

export function CustomEmailTest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const { response, data } = await post("/api/email/custom", {
        to: form.get("to"),
        subject: form.get("subject"),
        body: form.get("body"),
      });

      setResult(
        response.ok
          ? { ok: true, message: `Sent to ${form.get("to")}`, detail: `id: ${data.messageId ?? "—"} · via ${data.transport}` }
          : { ok: false, message: data.error ?? "Send failed" },
      );
      if (response.ok) router.refresh();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      step={1}
      title="Custom email"
      description="You choose the recipient, the subject and the body."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input name="to" type="email" required placeholder="Send to — you@example.com" className={inputClass} />
        <input
          name="subject"
          type="text"
          required
          defaultValue="Test 1 — custom email"
          className={inputClass}
        />
        <textarea
          name="body"
          required
          rows={4}
          defaultValue="Typing whatever you like here and checking it arrives intact."
          className={inputClass}
        />
        <SubmitButton pending={pending}>Send custom email</SubmitButton>
        <ResultBanner result={result} />
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Test 2 — fixed body, recipient still chosen                                 */
/* -------------------------------------------------------------------------- */

export function StaticEmailTest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const { response, data } = await post("/api/email/static", { to: form.get("to") });
      setResult(
        response.ok
          ? { ok: true, message: `Sent to ${form.get("to")}`, detail: `id: ${data.messageId ?? "—"} · via ${data.transport}` }
          : { ok: false, message: data.error ?? "Send failed" },
      );
      if (response.ok) router.refresh();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      step={2}
      title="Static email"
      description="Fixed lorem ipsum body — you only pick who it goes to."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input name="to" type="email" required placeholder="Send to — you@example.com" className={inputClass} />
        <p className="rounded-md bg-zinc-50 p-3 text-xs leading-relaxed text-[--color-muted]">
          {LOREM_IPSUM.slice(0, 180)}…
        </p>
        <SubmitButton pending={pending}>Send static email</SubmitButton>
        <ResultBanner result={result} />
      </form>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Test 3 — write a row, then email a receipt for it                           */
/* -------------------------------------------------------------------------- */

export function CreateItemTest() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setResult(null);

    try {
      const { response, data } = await post("/api/items", {
        name: form.get("name"),
        quantity: Number(form.get("quantity")),
        to: form.get("to"),
      });

      if (!response.ok) {
        setResult({ ok: false, message: data.error ?? "Request failed" });
      } else if (data.email?.ok) {
        setResult({
          ok: true,
          message: "Row saved and receipt sent",
          detail: `row: ${data.item.id} · id: ${data.email.messageId ?? "—"}`,
        });
      } else {
        // The insert succeeded but the send did not — say so precisely, since
        // that isolates the failure to the email side.
        setResult({
          ok: false,
          message: "Row saved, but the email failed",
          detail: data.email?.error ?? "unknown error",
        });
      }
      router.refresh();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      step={3}
      title="Create a record, then email a receipt"
      description="Writes a row to Postgres and emails the details — tests the database and email together."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex gap-3">
          <input name="name" type="text" required placeholder="Item name" className={inputClass} />
          <input
            name="quantity"
            type="number"
            min={1}
            max={10000}
            defaultValue={1}
            required
            className={`${inputClass} w-24 shrink-0`}
          />
        </div>
        <input name="to" type="email" required placeholder="Receipt to — you@example.com" className={inputClass} />
        <SubmitButton pending={pending}>Save &amp; send receipt</SubmitButton>
        <ResultBanner result={result} />
      </form>
    </Card>
  );
}
