import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { detectTransport, fromAddress } from "@/lib/email";

/**
 * Unauthenticated readiness probe.
 *
 * Deliberately reports only whether things are wired, never the values — this
 * endpoint is public, so it must not leak connection strings or credentials.
 */
export async function GET() {
  let database: { ok: boolean; error?: string };
  try {
    await query("select 1");
    database = { ok: true };
  } catch (err) {
    database = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const transport = detectTransport();
  const body = {
    app: process.env.APP_NAME ?? "simple-app-roar-ai",
    environment: process.env.APP_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown",
    database,
    email: { transport, from: fromAddress(), configured: transport !== null },
  };

  return NextResponse.json(body, { status: database.ok && transport ? 200 : 503 });
}
