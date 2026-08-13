import { lookup } from "node:dns/promises";
import { connect } from "node:net";
import { NextResponse } from "next/server";
import { connectionEnvName } from "@/lib/db";
import { isProbeAuthorized, probeEnabled } from "@/lib/probe";

export const dynamic = "force-dynamic";

/**
 * Network-level diagnosis of the database connection, run from inside the app
 * container.
 *
 * /api/health can only say "the Postgres client timed out", which is
 * compatible with a DNS fault, a dropped route, a closed port and a pooler
 * that accepts TCP but never speaks. This separates them.
 *
 * Gated behind PROBE_TOKEN because it reveals internal hostnames and addresses.
 */

/** Host and port only — never the user or password embedded in the URL. */
function targetFromEnv(): { host: string; port: number } | null {
  const name = connectionEnvName();
  if (!name) return null;
  try {
    const url = new URL(process.env[name]!);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return null;
  }
}

async function resolveHost(host: string) {
  const startedAt = performance.now();
  try {
    const results = await lookup(host, { all: true });
    return {
      ok: true,
      ms: Math.round(performance.now() - startedAt),
      addresses: results.map((r) => `${r.address} (IPv${r.family})`),
    };
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Raw TCP reachability — no Postgres protocol involved. */
function tcpProbe(host: string, port: number, timeoutMs = 5_000) {
  return new Promise<{ ok: boolean; ms: number; error?: string }>((resolve) => {
    const startedAt = performance.now();
    const socket = connect({ host, port });
    const finish = (ok: boolean, error?: string) => {
      socket.destroy();
      resolve({ ok, ms: Math.round(performance.now() - startedAt), error });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, `no response within ${timeoutMs}ms`));
    socket.once("error", (err: NodeJS.ErrnoException) =>
      finish(false, err.code ? `${err.code}: ${err.message}` : err.message),
    );
  });
}

export async function GET(request: Request) {
  if (!probeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isProbeAuthorized(request))) {
    return NextResponse.json({ error: "Invalid probe token" }, { status: 401 });
  }

  const target = targetFromEnv();
  if (!target) {
    return NextResponse.json(
      { error: "No usable connection string found", foundAs: connectionEnvName() ?? null },
      { status: 503 },
    );
  }

  const dns = await resolveHost(target.host);
  const tcp = dns.ok ? await tcpProbe(target.host, target.port) : null;

  // Say plainly which layer failed, so the answer does not depend on reading
  // timings correctly.
  let verdict: string;
  if (!dns.ok) {
    verdict = "DNS failed — the database hostname does not resolve from this container.";
  } else if (!tcp?.ok && /ECONNREFUSED/.test(tcp?.error ?? "")) {
    verdict = `Host is reachable but nothing is listening on port ${target.port}.`;
  } else if (!tcp?.ok) {
    verdict = `DNS resolves but TCP to port ${target.port} never completes — packets are being dropped (firewall, security group or missing route), not refused.`;
  } else {
    verdict = `TCP to port ${target.port} succeeds, so the network path is fine. A Postgres-level timeout now points at the pooler or the database itself, not connectivity.`;
  }

  return NextResponse.json({
    target: { host: target.host, port: target.port, foundAs: connectionEnvName() },
    dns,
    tcp,
    verdict,
  });
}
