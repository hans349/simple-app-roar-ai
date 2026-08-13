import { NextResponse } from "next/server";
import { connectionEnvName, query, usingSsl } from "@/lib/db";
import { describeEmailEnv, detectTransport, fromAddress } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Unauthenticated readiness probe and environment introspector.
 *
 * Reports which variable NAMES the platform injected, never their values —
 * this endpoint is public, so it must never leak a connection string or an
 * SMTP password. Roar's docs do not name the email variables, so this is how
 * you find out what they actually are.
 */
export async function GET() {
  // Goes through the normal query path, so this also proves the schema
  // bootstrap succeeded rather than just that a socket opened.
  let database: { ok: boolean; foundAs?: string; ssl?: boolean | null; error?: string };
  try {
    await query("select 1");
    database = { ok: true, foundAs: connectionEnvName(), ssl: usingSsl() };
  } catch (err) {
    database = {
      ok: false,
      foundAs: connectionEnvName(),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const transport = detectTransport();
  const { found, otherCandidates } = describeEmailEnv();

  const body = {
    app: process.env.APP_NAME ?? "simple-app-roar-ai",
    environment: process.env.APP_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown",
    url: process.env.APP_PUBLIC_URL ?? process.env.APP_URL ?? null,
    node: process.version,
    database,
    email: {
      configured: transport !== null,
      transport,
      from: fromAddress(),
      // Variable names only.
      variables: found,
      otherMailVariablesPresent: otherCandidates,
    },
    aiGateway: {
      keyPresent: Boolean(process.env.ROAR_API_KEY),
      baseUrl: process.env.ROAR_BASE_URL ?? null,
    },
  };

  return NextResponse.json(body, { status: database.ok && transport ? 200 : 503 });
}
