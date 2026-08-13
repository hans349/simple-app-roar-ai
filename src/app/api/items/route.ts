import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { parseEmail, parseQuantity, parseText } from "@/lib/validation";
import { itemReceiptEmail } from "@/lib/templates";
import { sendAndLog } from "@/lib/send-and-log";

type Item = { id: string; name: string; quantity: number; created_at: Date };

/**
 * Test 3 — write a row, then email a receipt about it.
 *
 * This is the one that exercises the whole stack in a single request: session
 * lookup, insert, then send.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const name = parseText(payload.name, "item name", { max: 120 });
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const quantity = parseQuantity(payload.quantity ?? 1);
  if (!quantity.ok) return NextResponse.json({ error: quantity.error }, { status: 400 });

  const to = parseEmail(payload.to, "recipient");
  if (!to.ok) return NextResponse.json({ error: to.error }, { status: 400 });

  const item = await queryOne<Item>(
    `insert into items (user_id, name, quantity) values ($1, $2, $3)
     returning id, name, quantity, created_at`,
    [user.id, name.value, quantity.value],
  );
  if (!item) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  const email = itemReceiptEmail(item);
  const outcome = await sendAndLog({
    userId: user.id,
    kind: "item_receipt",
    to: to.value,
    itemId: item.id,
    ...email,
  });

  // The row is saved regardless of whether the email got through — report both
  // independently so a failure points at the right subsystem.
  return NextResponse.json({ item, email: outcome }, { status: 200 });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const items = await query<Item>(
    `select id, name, quantity, created_at from items
      where user_id = $1 order by created_at desc limit 25`,
    [user.id],
  );

  return NextResponse.json({ items });
}
