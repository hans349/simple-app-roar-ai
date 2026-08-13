import { Pool } from "pg";

/**
 * Postgres connection.
 *
 * The platform is expected to inject a connection string. We accept the common
 * names so this keeps working whatever the host calls it.
 */
const CONNECTION_ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "PG_CONNECTION_STRING",
  "POSTGRESQL_URL",
] as const;

function connectionString(): string {
  for (const name of CONNECTION_ENV_NAMES) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `No database connection string found. Looked for: ${CONNECTION_ENV_NAMES.join(", ")}.`,
  );
}

// Managed Postgres almost always terminates TLS with a cert the container does
// not trust. Opt out of verification unless the URL already says otherwise.
function sslOption(url: string) {
  if (/sslmode=(disable|allow)/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __schemaReady: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!global.__pgPool) {
    const url = connectionString();
    global.__pgPool = new Pool({
      connectionString: url,
      ssl: sslOption(url),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
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
 * This app is a throwaway harness for smoke-testing a host, and the host may
 * not give us a SQL console or a migration step. Self-migrating on boot means
 * deploying the repo is the only setup needed. A real app would use versioned
 * migrations instead.
 */
export function ensureSchema(): Promise<void> {
  if (!global.__schemaReady) {
    global.__schemaReady = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        // Let the next request retry rather than caching the failure forever.
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
  const result = await getPool().query(text, params);
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
