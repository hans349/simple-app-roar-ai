import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseEmail, parseText } from "@/lib/validation";
import { customEmail } from "@/lib/templates";
import { sendAndLog } from "@/lib/send-and-log";

/** Test 1 — the user picks the recipient, the subject and the body. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const to = parseEmail(payload.to, "recipient");
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });

  const subject = parseText(payload.subject, "subject", { max: 200 });
  if (!subject.ok) return NextResponse.json({ error: subject.error }, { status: 400 });

  const body = parseText(payload.body, "body", { max: 5000 });
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

  const email = customEmail(subject.value, body.value);
  const outcome = await sendAndLog({
    userId: user.id,
    kind: "custom",
    to: to.value,
    ...email,
  });

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
}
