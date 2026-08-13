import { lookup } from "node:dns/promises";
import { connect, isIP } from "node:net";
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
function tcpProbe(host: string, port: number, timeoutMs = 4_000) {
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

  const isLiteralIp = isIP(target.host) !== 0;
  const dns = isLiteralIp
    ? { ok: true, ms: 0, addresses: [target.host], note: "Literal IP — no DNS lookup performed." }
    : await resolveHost(target.host);

  // Postgres direct, in case only the pooler is unreachable; and a public host
  // as a control, to tell "this container has no egress at all" apart from
  // "this particular destination is unreachable".
  const [tcp, direct, control] = await Promise.all([
    tcpProbe(target.host, target.port),
    target.port === 5432
      ? Promise.resolve(null)
      : tcpProbe(target.host, 5432).then((r) => ({ port: 5432, ...r })),
    tcpProbe("1.1.1.1", 443).then((r) => ({ target: "1.1.1.1:443", ...r })),
  ]);

  // Say plainly which layer failed, so the answer does not depend on reading
  // timings correctly.
  let verdict: string;
  if (!dns.ok) {
    verdict = "DNS failed — the database hostname does not resolve from this container.";
  } else if (tcp.ok) {
    verdict = `TCP to port ${target.port} succeeds, so the network path is fine. A Postgres-level timeout now points at the pooler or the database itself, not connectivity.`;
  } else if (/ECONNREFUSED/.test(tcp.error ?? "")) {
    verdict = `Host is reachable but nothing is listening on port ${target.port} — the service is down rather than blocked.`;
  } else if (direct?.ok) {
    verdict = `Port ${target.port} is blocked but Postgres on 5432 is reachable. Pointing DATABASE_URL at port 5432 would work around the pooler.`;
  } else if (!control.ok) {
    verdict =
      "Neither the database nor a public address is reachable — this container appears to have no outbound network at all.";
  } else {
    verdict = `Public egress works but nothing on ${target.host} answers on any port tried. The container has no route onto that network — it is not attached to the overlay, or egress to that range is blocked. Packets are dropped, not refused, so the database itself may be healthy.`;
  }

  return NextResponse.json({
    target: {
      host: target.host,
      port: target.port,
      foundAs: connectionEnvName(),
      // 100.64.0.0/10 is RFC 6598 shared address space, used by overlay
      // networks (Tailscale, some CNIs) rather than ordinary private ranges.
      addressRange: describeRange(target.host),
    },
    dns,
    tcp,
    postgresDirect: direct,
    publicEgress: control,
    verdict,
  });
}

function describeRange(host: string): string | null {
  if (isIP(host) !== 4) return null;
  const [a, b] = host.split(".").map(Number);
  if (a === 100 && b >= 64 && b <= 127) return "100.64.0.0/10 — RFC 6598 shared address space (CGNAT range, typical of overlay networks)";
  if (a === 10) return "10.0.0.0/8 — RFC 1918 private";
  if (a === 172 && b >= 16 && b <= 31) return "172.16.0.0/12 — RFC 1918 private";
  if (a === 192 && b === 168) return "192.168.0.0/16 — RFC 1918 private";
  if (a === 127) return "127.0.0.0/8 — loopback";
  return "public";
}
