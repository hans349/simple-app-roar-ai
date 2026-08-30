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

// Two attempts have to fit inside one HTTP request, so keep each one short.
const CONNECT_TIMEOUT_MS = 8_000;

/** A managed database that terminates TLS rarely presents a cert we can chain. */
function createPool(url: string, useSsl: boolean): Pool {
  return new Pool({
    connectionString: url,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
}

/**
 * Should we retry this failure with the opposite TLS setting?
 *
 * A server that speaks no TLS usually says so. But one sitting behind a proxy
 * that swallows the SSLRequest instead just never answers, so a timeout has to
 * count as "maybe TLS is the problem" too. Auth and DNS errors are excluded —
 * retrying those only produces a second, less informative error.
 */
function isWorthRetryingWithoutSsl(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/password|authentication|role .* does not exist|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return false;
  }
  return /does not support SSL|SSL.*not enabled|server does not support|timeout|ECONNRESET|EPROTO/i.test(
    message,
  );
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

export type ConnectAttempt = { ssl: boolean; ok: boolean; ms: number; error?: string };
let lastAttempts: ConnectAttempt[] = [];

/** Whether the live connection ended up using TLS. Null until connected. */
export function usingSsl(): boolean | null {
  return negotiatedSsl;
}

/**
 * What each connection attempt did. Error text only — no host, no credentials —
 * so this is safe to expose on the public health endpoint.
 */
export function connectionAttempts(): ConnectAttempt[] {
  return lastAttempts;
}

/** Port only, to distinguish "pointed at the wrong thing" from "unreachable". */
export function connectionPort(): string | null {
  try {
    return new URL(connectionString()).port || "5432 (default)";
  } catch {
    return null;
  }
}

async function connect(): Promise<Pool> {
  const url = connectionString();
  const attempts = /sslmode=(disable|allow)/.test(url) ? [false] : [true, false];
  const log: ConnectAttempt[] = [];

  let lastError: unknown;
  for (const useSsl of attempts) {
    const pool = createPool(url, useSsl);
    const startedAt = performance.now();
    try {
      await pool.query("select 1");
      log.push({ ssl: useSsl, ok: true, ms: Math.round(performance.now() - startedAt) });
      lastAttempts = log;
      negotiatedSsl = useSsl;
      return pool;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.push({
        ssl: useSsl,
        ok: false,
        ms: Math.round(performance.now() - startedAt),
        error: message,
      });
      lastError = err;
      await pool.end().catch(() => undefined);
      if (!isWorthRetryingWithoutSsl(err)) break;
    }
  }

  lastAttempts = log;
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

// Best-effort: gen_random_uuid() is built in from Postgres 13, so this only
// matters on older servers — and creating extensions often needs rights a
// managed database will not grant. Never let it fail the bootstrap.
const EXTENSION_SQL = `create extension if not exists pgcrypto;`;

const SCHEMA_SQL = `
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

-- QA fixtures for the console table editor. Not used by the application.
-- Four primary-key shapes; app_users / items / email_logs already cover the
-- fourth (a key called "id").

-- Single-column key that is not named "id".
create table if not exists order_items_legacy (
  sku   text primary key,
  label text
);

-- An earlier revision created order_items keyed (order_id, sku) — the same
-- order the columns are declared in, which is the case that does NOT exercise
-- key ordering. Drop that version once so the corrected shape below applies.
-- Keyed off the absence of "qty", which only the old shape lacks, so this is a
-- no-op on every later deploy and rows added through the console survive.
do $$
begin
  if to_regclass('public.order_items') is not null
     and not exists (
       select 1 from information_schema.columns
        where table_name = 'order_items' and column_name = 'qty'
     )
  then
    drop table order_items;
  end if;
end $$;

-- Composite key whose column order deliberately differs from the declaration
-- order: sku is declared second but is the first key column. An editor that
-- assumes key order follows column order will address rows wrongly.
create table if not exists order_items (
  order_id int,
  sku      text,
  qty      int,
  primary key (sku, order_id)
);

-- No primary key at all, so no single row can be addressed.
create table if not exists notes (
  body text
);
alter table notes add column if not exists "at" timestamptz default now();

-- Seed rows, so the editor has something to act on.
--
-- Deliberately overlapping on each half of the composite key: two rows share
-- order_id 1001, and two share sku WIDGET-A. An editor that addresses rows by
-- only one key column therefore updates the wrong row visibly, instead of
-- appearing to work because every value happened to be unique.
insert into order_items (order_id, sku, qty) values
  (1001, 'WIDGET-A', 3),
  (1001, 'WIDGET-B', 1),
  (1002, 'WIDGET-A', 7)
on conflict do nothing;

insert into order_items_legacy (sku, label) values
  ('WIDGET-A', 'Widget, type A'),
  ('WIDGET-B', 'Widget, type B')
on conflict do nothing;

-- No key to conflict on, so guard on emptiness to stay idempotent.
insert into notes (body)
select 'First note — this table has no primary key.'
 where not exists (select 1 from notes);

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
      .then(async (pool) => {
        await pool.query(EXTENSION_SQL).catch(() => undefined);
        await pool.query(SCHEMA_SQL);
      })
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
