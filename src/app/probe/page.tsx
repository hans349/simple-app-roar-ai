import Link from "next/link";
import { detectTransport, fromAddress } from "@/lib/email";
import { isProbeUnlocked, probeEnabled } from "@/lib/probe";
import { lockAction } from "./actions";
import { Card } from "@/components/test-ui";
import {
  DiagnoseButton,
  ProbeCustomEmailTest,
  ProbeStaticEmailTest,
  UnlockForm,
} from "@/components/probe-tests";

export const dynamic = "force-dynamic";

/**
 * The email tests, without the database.
 *
 * /dashboard needs a session, a session needs Postgres, and Postgres may be
 * the thing under investigation. This page touches no database at all, so the
 * email half of the stack stays testable on its own.
 */
export default async function ProbePage() {
  const enabled = probeEnabled();
  const unlocked = await isProbeUnlocked();
  const transport = detectTransport();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header>
        <h1 className="text-xl font-semibold">Email tests — no database</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Runs the email tests without a login, so they still work while Postgres is unreachable.
          Nothing here reads or writes the database, so sends are not recorded in{" "}
          <code className="font-mono">email_logs</code>.
        </p>
      </header>

      {!enabled ? (
        <div className="mt-6 rounded-lg border border-[--color-border] bg-[--color-surface] p-5 text-sm">
          <p className="font-medium">This page is disabled.</p>
          <p className="mt-1 text-[--color-muted]">
            Set <code className="font-mono">PROBE_TOKEN</code> in the platform environment to any
            random string, then reload. Without it these routes return 404, so an unconfigured
            deploy cannot be used to send mail.
          </p>
        </div>
      ) : !unlocked ? (
        <div className="mt-6 max-w-sm rounded-lg border border-[--color-border] bg-[--color-surface] p-5">
          <h2 className="text-sm font-semibold">Enter the probe token</h2>
          <p className="mb-4 mt-1 text-sm text-[--color-muted]">
            The value of <code className="font-mono">PROBE_TOKEN</code>. Unlocks for 8 hours.
          </p>
          <UnlockForm />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 text-sm">
            <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${transport ? "bg-emerald-500" : "bg-red-500"}`}
                />
                {transport ? `Email via ${transport}` : "No email transport configured"}
              </span>
              <span className="text-[--color-muted]">
                from <code className="font-mono">{fromAddress()}</code>
              </span>
            </span>
            <form action={lockAction}>
              <button
                type="submit"
                className="rounded-md border border-[--color-border] bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50"
              >
                Lock
              </button>
            </form>
          </div>

          <div className="mt-6 space-y-4">
            <ProbeCustomEmailTest />
            <ProbeStaticEmailTest />

            <Card
              step={3}
              title="Create a record, then email a receipt"
              description="Needs Postgres, so it cannot run here. Available on the dashboard once the database is reachable."
              disabled
            >
              <p className="text-sm text-[--color-muted]">
                Waiting on the database.{" "}
                <Link href="/dashboard" className="text-[--color-accent] hover:underline">
                  Go to the dashboard
                </Link>{" "}
                to run it.
              </p>
            </Card>
          </div>

          <section className="mt-10">
            <h2 className="text-sm font-semibold">Why is the database unreachable?</h2>
            <p className="mb-3 mt-1 text-sm text-[--color-muted]">
              Resolves the database hostname and opens a raw TCP connection from inside this
              container, which separates a DNS fault from a dropped route, a closed port, and a
              pooler that accepts connections but never replies.
            </p>
            <DiagnoseButton />
          </section>
        </>
      )}

      <p className="mt-10 text-sm text-[--color-muted]">
        <Link href="/login" className="hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </main>
  );
}
