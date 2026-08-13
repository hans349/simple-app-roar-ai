import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseEmail } from "@/lib/validation";
import { staticEmail } from "@/lib/templates";
import { sendAndLog } from "@/lib/send-and-log";

/** Test 2 — fixed lorem ipsum body; the user still chooses the recipient. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const to = parseEmail(payload.to, "recipient");
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });

  const email = staticEmail();
  const outcome = await sendAndLog({
    userId: user.id,
    kind: "static",
    to: to.value,
    ...email,
  });

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 502 });
}
