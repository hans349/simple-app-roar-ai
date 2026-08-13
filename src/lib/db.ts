import { Pool } from "pg";

/**
 * Postgres connection.
 *
 * Roar injects DATABASE_URL for its managed Postgres; the other names are
 * accepted so this still works off-platform.
 */
const CONNECTION_ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "PG_CONNECTION_STRING",
  "POSTGRESQL_URL",
] as const;

export function connectionEnvName(): string | undefined {
  return CONNECTION_ENV_NAMES.find((name) => process.env[name]);
}

function connectionString(): string {
  const name = connectionEnvName();
  if (!name) {
    throw new Error(
      `No database connection string found. Looked for: ${CONNECTION_ENV_NAMES.join(", ")}.`,
    );
  }
  return process.env[name]!;
}

/** A managed database that terminates TLS rarely presents a cert we can chain. */
function createPool(url: string, useSsl: boolean): Pool {
  return new Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

function isSslUnsupported(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /does not support SSL|SSL.*not enabled|server does not support/i.test(message);
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Promise<Pool> | undefined;
  // eslint-disable-next-line no-var
  var __schemaReady: Promise<void> | undefined;
}

/**
 * Connect, negotiating TLS by trial.
 *
 * Whether a managed Postgres requires TLS, tolerates it, or refuses it outright
 * varies by host and is not something the connection string always states. Try
 * TLS first and fall back only on the specific "server does not support SSL"
 * failure, so a genuine auth or network error still surfaces immediately
 * instead of being retried into a confusing second error.
 */
let negotiatedSsl: boolean | null = null;

/** Whether the live connection ended up using TLS. Null until connected. */
export function usingSsl(): boolean | null {
  return negotiatedSsl;
}

async function connect(): Promise<Pool> {
  const url = connectionString();
  const attempts = /sslmode=(disable|allow)/.test(url) ? [false] : [true, false];

  let lastError: unknown;
  for (const useSsl of attempts) {
    const pool = createPool(url, useSsl);
    try {
      await pool.query("select 1");
      negotiatedSsl = useSsl;
      return pool;
    } catch (err) {
      lastError = err;
      await pool.end().catch(() => undefined);
      if (!isSslUnsupported(err)) throw err;
    }
  }
  throw lastError;
}

function getPool(): Promise<Pool> {
  if (!global.__pgPool) {
    global.__pgPool = connect().catch((err) => {
      // Let the next request retry rather than caching the failure for the
      // lifetime of the process — these apps sleep and wake constantly.
      global.__pgPool = undefined;
      throw err;
    });
  }
  return global.__pgPool;
}

const SCHEMA_SQL = `
create extension if not exists pgcrypto;

create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_users(id) on delete cascade,
  name       text not null,
  quantity   integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists email_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references app_users(id) on delete set null,
  test_kind           text not null,
  to_email            text not null,
  subject             text not null,
  status              text not null,
  provider_message_id text,
  error               text,
  item_id             uuid references items(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists items_user_created_idx on items (user_id, created_at desc);
create index if not exists email_logs_user_created_idx on email_logs (user_id, created_at desc);
create index if not exists sessions_expires_idx on sessions (expires_at);
`;

/**
 * Create tables on first use.
 *
 * This app is a throwaway harness and the host gives no migration step, so
 * deploying the repo is the only setup needed. A real app would use versioned
 * migrations instead.
 */
export function ensureSchema(): Promise<void> {
  if (!global.__schemaReady) {
    global.__schemaReady = getPool()
      .then((pool) => pool.query(SCHEMA_SQL))
      .then(() => undefined)
      .catch((err) => {
        global.__schemaReady = undefined;
        throw err;
      });
  }
  return global.__schemaReady;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const pool = await getPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** Single-row convenience wrapper. */
export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
