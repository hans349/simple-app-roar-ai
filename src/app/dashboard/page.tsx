import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { detectTransport, fromAddress } from "@/lib/email";
import { signOutAction } from "@/app/actions";
import { CreateItemTest, CustomEmailTest, StaticEmailTest } from "@/components/email-tests";

export const dynamic = "force-dynamic";

type ItemRow = { id: string; name: string; quantity: number; created_at: Date };
type LogRow = {
  id: string;
  test_kind: string;
  to_email: string;
  subject: string;
  status: string;
  error: string | null;
  created_at: Date;
};

const KIND_LABELS: Record<string, string> = {
  custom: "Test 1 · custom",
  static: "Test 2 · static",
  item_receipt: "Test 3 · receipt",
};

function formatTime(value: Date) {
  return new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, logs] = await Promise.all([
    query<ItemRow>(
      `select id, name, quantity, created_at from items
        where user_id = $1 order by created_at desc limit 10`,
      [user.id],
    ),
    query<LogRow>(
      `select id, test_kind, to_email, subject, status, error, created_at from email_logs
        where user_id = $1 order by created_at desc limit 10`,
      [user.id],
    ),
  ]);

  const transport = detectTransport();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Email &amp; database test harness</h1>
          <p className="mt-1 text-sm text-[--color-muted]">Signed in as {user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-[--color-border] bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <div className="mt-6 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Database connected
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${transport ? "bg-emerald-500" : "bg-red-500"}`}
            />
            {transport ? `Email via ${transport}` : "No email transport configured"}
          </span>
          <span className="text-[--color-muted]">
            from <code className="font-mono">{fromAddress()}</code>
          </span>
        </div>
        {!transport && (
          <p className="mt-2 text-xs text-red-700">
            All three tests will fail until email credentials are present. Open{" "}
            <a href="/api/health" className="underline">
              /api/health
            </a>{" "}
            to see which variables the platform actually injected.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <CustomEmailTest />
        <StaticEmailTest />
        <CreateItemTest />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Recent rows in `items`</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-[--color-muted]">Nothing yet — run test 3.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-surface] text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="truncate font-medium">
                  {item.name} <span className="text-[--color-muted]">× {item.quantity}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                  {formatTime(item.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Recent sends</h2>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm text-[--color-muted]">No emails attempted yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-surface] text-sm">
            {logs.map((log) => (
              <li key={log.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        log.status === "sent" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <span className="truncate">
                      <span className="text-[--color-muted]">
                        {KIND_LABELS[log.test_kind] ?? log.test_kind} →{" "}
                      </span>
                      {log.to_email}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                    {formatTime(log.created_at)}
                  </span>
                </div>
                {log.error && (
                  <p className="mt-1 pl-3.5 font-mono text-xs text-red-700">{log.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
