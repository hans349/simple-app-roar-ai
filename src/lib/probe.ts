import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const PROBE_COOKIE = "probe_unlocked";
const UNLOCK_HOURS = 8;

/** The probe endpoints exist only when a token has been configured. */
export function probeEnabled(): boolean {
  return Boolean(process.env.PROBE_TOKEN);
}

/**
 * Compare against PROBE_TOKEN.
 *
 * Hash both sides first so differing lengths cannot throw and so the
 * comparison runs in constant time.
 */
export function tokenMatches(provided: string | null | undefined): boolean {
  const expected = process.env.PROBE_TOKEN;
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * The cookie holds the token's hash rather than the token, so a value read off
 * the browser cannot be replayed against the API's header auth.
 */
function cookieValue(): string {
  return createHash("sha256").update(process.env.PROBE_TOKEN!).digest("hex");
}

export async function unlockProbe(): Promise<void> {
  const store = await cookies();
  store.set(PROBE_COOKIE, cookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_HOURS * 60 * 60,
  });
}

export async function lockProbe(): Promise<void> {
  const store = await cookies();
  store.delete(PROBE_COOKIE);
}

export async function isProbeUnlocked(): Promise<boolean> {
  if (!probeEnabled()) return false;
  const store = await cookies();
  const value = store.get(PROBE_COOKIE)?.value;
  if (!value) return false;

  const expected = Buffer.from(cookieValue(), "utf8");
  const actual = Buffer.from(value, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Header token or unlocked cookie — the API accepts either. */
export async function isProbeAuthorized(request: Request): Promise<boolean> {
  const header =
    request.headers.get("x-probe-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  if (tokenMatches(header)) return true;
  return isProbeUnlocked();
}
