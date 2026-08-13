"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOREM_IPSUM } from "@/lib/templates";
import { Card, inputClass, post, ResultBanner, SubmitButton, type Result } from "./test-ui";

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
          ? {
              ok: true,
              message: `Sent to ${form.get("to")}`,
              detail: `id: ${data.messageId ?? "—"} · via ${data.transport}`,
            }
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
        <input
          name="to"
          type="email"
          required
          placeholder="Send to — you@example.com"
          className={inputClass}
        />
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
          ? {
              ok: true,
              message: `Sent to ${form.get("to")}`,
              detail: `id: ${data.messageId ?? "—"} · via ${data.transport}`,
            }
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
        <input
          name="to"
          type="email"
          required
          placeholder="Send to — you@example.com"
          className={inputClass}
        />
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
        <input
          name="to"
          type="email"
          required
          placeholder="Receipt to — you@example.com"
          className={inputClass}
        />
        <SubmitButton pending={pending}>Save &amp; send receipt</SubmitButton>
        <ResultBanner result={result} />
      </form>
    </Card>
  );
}
