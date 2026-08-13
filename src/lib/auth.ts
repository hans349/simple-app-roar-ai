import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";
import { hashPassword } from "./password";

export { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "session";
const SESSION_TTL_DAYS = 7;

export type AppUser = {
  id: string;
  email: string;
  created_at: Date;
};

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

// Only the hash is stored, so a leaked database dump cannot be replayed as a
// set of live sessions.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [hashToken(token), userId, expiresAt],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from pages and route handlers. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  return queryOne<AppUser>(
    `select u.id, u.email, u.created_at
       from sessions s
       join app_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export async function findUserByEmail(
  email: string,
): Promise<(AppUser & { password_hash: string }) | null> {
  return queryOne<AppUser & { password_hash: string }>(
    `select id, email, password_hash, created_at from app_users where email = $1`,
    [email],
  );
}

export async function createUser(email: string, password: string): Promise<AppUser> {
  const passwordHash = await hashPassword(password);
  const user = await queryOne<AppUser>(
    `insert into app_users (email, password_hash) values ($1, $2)
     returning id, email, created_at`,
    [email, passwordHash],
  );
  if (!user) throw new Error("Failed to create user");
  return user;
}
