import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseEmail } from "@/lib/validation";
import { staticEmail } from "@/lib/templates";
import { detectTransport, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Send a test email without touching the database.
 *
 * The three real tests all sit behind a login, which needs Postgres — so a
 * broken database blocks testing email even though email is fine. This route
 * bypasses that: no session, no reads, no writes.
 *
 * It is disabled unless PROBE_TOKEN is set, and returns 404 when absent so an
 * unconfigured deploy exposes nothing that could be used as an open relay.
 */
function tokenMatches(provided: string | null): boolean {
  const expected = process.env.PROBE_TOKEN;
  if (!expected || !provided) return false;

  // Hash first so differing lengths cannot throw, and compare in constant time.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.PROBE_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const provided =
    request.headers.get("x-probe-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (!tokenMatches(provided)) {
    return NextResponse.json({ error: "Invalid probe token" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const to = parseEmail(payload.to, "recipient");
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });

  try {
    const email = staticEmail();
    const result = await sendEmail({ to: to.value, ...email });
    return NextResponse.json({
      ok: true,
      to: to.value,
      transport: result.transport,
      messageId: result.messageId,
      note: "Sent without any database access.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        transport: detectTransport(),
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
