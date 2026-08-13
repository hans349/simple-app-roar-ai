# simple-app-roar-ai

A deliberately small Next.js app whose only job is to prove that a host's
**database** and **email** services actually work. Register an account, sign in,
then run three tests from one page.

Use throwaway addresses and dummy data only. This is a harness, not a product.

## The three tests

| # | Test | What it proves |
|---|------|----------------|
| 1 | **Custom email** — you choose recipient, subject and body | Email delivery with user-supplied content |
| 2 | **Static email** — fixed lorem ipsum body, you choose the recipient | Delivery in isolation, with nothing variable to blame |
| 3 | **Create a record, then email a receipt** | Database write *and* email in one request — the real end-to-end path |

Test 3 reports the insert and the send separately, so a failure points at the
right subsystem: "Row saved, but the email failed" means Postgres is fine and
the mail transport is not.

Every attempt, successful or not, is written to the `email_logs` table and shown
at the bottom of the dashboard.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

### Environment variables

**Database** — one Postgres connection string, under any of `DATABASE_URL`,
`POSTGRES_URL`, `PG_CONNECTION_STRING` or `POSTGRESQL_URL`.

**Email** — whichever of these is configured wins, checked in this order:

1. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
2. `RESEND_API_KEY`

`EMAIL_FROM` sets the from address. On the platform this is injected for you
(`noreply@appemailalerts.com`).

If neither transport is set the dashboard says so in a red banner rather than
failing silently at send time.

### Database schema

There is no migration step. The app creates its tables on first query — see
`SCHEMA_SQL` in [src/lib/db.ts](src/lib/db.ts). That is a deliberate shortcut so
that deploying the repo is the *only* setup required, and is not how a real app
should manage schema.

Tables: `app_users`, `sessions`, `items`, `email_logs`.

## Checking it from the terminal

`GET /api/health` is public and reports whether the database is reachable and
which mail transport is configured. It returns names and booleans only, never
credentials.

```bash
curl -s https://<your-app>/api/health | jq
```

```json
{
  "app": "simple-app-roar-ai",
  "environment": "production",
  "database": { "ok": true },
  "email": { "transport": "smtp", "from": "noreply@appemailalerts.com", "configured": true }
}
```

It returns `503` if either side is not ready, so it works as a deploy smoke test.

The three test endpoints require a session cookie:

| Method | Path | Body |
|--------|------|------|
| `POST` | `/api/email/custom` | `{ "to", "subject", "body" }` |
| `POST` | `/api/email/static` | `{ "to" }` |
| `POST` | `/api/items` | `{ "name", "quantity", "to" }` |
| `GET`  | `/api/items` | — |

## Auth

Email and password, built on the app's own `app_users` table — the platform's
config screen offers a database and email but no auth service, so there is
nothing to delegate to.

- Passwords hashed with scrypt from `node:crypto` (no native module to compile
  on an unknown build image).
- Sessions are random 32-byte tokens in an httpOnly cookie; only the SHA-256
  hash is stored, so a database dump cannot be replayed as live sessions.
- Sign-in returns the same error for an unknown email and a wrong password, so
  it cannot be used to enumerate accounts.

There is no email verification, password reset, or rate limiting. Fine for a
harness; not fine for anything real.

## Tests

```bash
npm test
```

Covers the backend logic that is worth covering — password hashing, input
validation, and HTML escaping in the email templates. No UI tests.

## Deploying

The platform builds from this repo. `next.config.ts` sets `output: "standalone"`,
which is harmless if the host runs `next start` and necessary if it runs a bare
container.

After a deploy, hit `/api/health` first. If it is green, register an account and
work through the three tests in order.
