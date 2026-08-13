import { NextResponse } from "next/server";
import { parseEmail, parseText } from "@/lib/validation";
import { customEmail, staticEmail } from "@/lib/templates";
import { detectTransport, sendEmail } from "@/lib/email";
import { isProbeAuthorized, probeEnabled } from "@/lib/probe";

export const dynamic = "force-dynamic";

/**
 * Send a test email without touching the database.
 *
 * The three real tests all sit behind a login, which needs Postgres — so a
 * broken database blocks testing email even though email is fine. This route
 * bypasses that: no session, no reads, no writes, no logging.
 *
 * Disabled unless PROBE_TOKEN is set, returning 404 when absent so an
 * unconfigured deploy exposes nothing that could be used as an open relay.
 */
export async function POST(request: Request) {
  if (!probeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isProbeAuthorized(request))) {
    return NextResponse.json({ error: "Invalid probe token" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const to = parseEmail(payload.to, "recipient");
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });

  // Subject and body are optional: with them this mirrors test 1, without them
  // it mirrors test 2.
  let email: { subject: string; text: string; html: string };
  if (payload.subject !== undefined || payload.body !== undefined) {
    const subject = parseText(payload.subject, "subject", { max: 200 });
    if (!subject.ok) return NextResponse.json({ error: subject.error }, { status: 400 });

    const body = parseText(payload.body, "body", { max: 5000 });
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

    email = customEmail(subject.value, body.value);
  } else {
    email = staticEmail();
  }

  try {
    const result = await sendEmail({ to: to.value, ...email });
    return NextResponse.json({
      ok: true,
      to: to.value,
      subject: email.subject,
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
