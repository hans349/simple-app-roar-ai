"use client";

import { useActionState, useState } from "react";
import { LOREM_IPSUM } from "@/lib/templates";
import { unlockAction, type UnlockState } from "@/app/probe/actions";
import { Card, inputClass, post, ResultBanner, SubmitButton, type Result } from "./test-ui";

/* -------------------------------------------------------------------------- */
/* Unlock                                                                      */
/* -------------------------------------------------------------------------- */

export function UnlockForm() {
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="token"
        type="password"
        required
        autoComplete="off"
        placeholder="Probe token"
        className={inputClass}
      />
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <SubmitButton pending={pending} label="Checking…">
        Unlock
      </SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Tests — same two email tests, minus the database                            */
/* -------------------------------------------------------------------------- */

/** Both tests hit the same endpoint; only the payload differs. */
function useProbeSend() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setResult(null);
    try {
      const { response, data } = await post("/api/email/probe", body);
      setResult(
        response.ok
          ? {
              ok: true,
              message: `Sent to ${body.to}`,
              detail: `id: ${data.messageId ?? "—"} · via ${data.transport}`,
            }
          : { ok: false, message: data.error ?? "Send failed" },
      );
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setPending(false);
    }
  }

  return { pending, result, send };
}

export function ProbeCustomEmailTest() {
  const { pending, result, send } = useProbeSend();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({
      to: form.get("to"),
      subject: form.get("subject"),
      body: form.get("body"),
    });
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

export function ProbeStaticEmailTest() {
  const { pending, result, send } = useProbeSend();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // No subject or body — the endpoint falls back to the fixed lorem ipsum.
    await send({ to: form.get("to") });
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
/* Network diagnosis                                                           */
/* -------------------------------------------------------------------------- */

export function DiagnoseButton() {
  const [pending, setPending] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setOutput(null);
    try {
      const response = await fetch("/api/diag");
      setOutput(JSON.stringify(await response.json(), null, 2));
    } catch (err) {
      setOutput(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-[--color-border] bg-white px-3.5 py-2 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Probing…" : "Run network diagnosis"}
      </button>
      {output && (
        <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100">
          {output}
        </pre>
      )}
    </div>
  );
}
