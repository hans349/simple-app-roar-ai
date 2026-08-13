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

**Database** — one Postgres connection string. Roar injects `DATABASE_URL`; the
app also accepts `POSTGRES_URL`, `PG_CONNECTION_STRING` and `POSTGRESQL_URL`.

**Email** — Roar's docs say credentials arrive as *"standard SMTP-style
variables"* but do not name them, so the app accepts every common spelling and
uses the first transport it finds:

1. A connection URL — `SMTP_URL`, `MAIL_URL`, `EMAIL_SERVER` or `EMAIL_URL`
2. Discrete SMTP variables — `SMTP_*`, `MAIL_*`, `EMAIL_SERVER_*` or `MAILER_*`
   (host, port, user, password)
3. `RESEND_API_KEY`, for running the same tests off-platform

`EMAIL_FROM` sets the from address (`noreply@appemailalerts.com` on Roar);
`SMTP_FROM`, `MAIL_FROM` and `EMAIL_SERVER_FROM` also work.

**Don't guess — ask the app.** `GET /api/health` reports which variable *names*
it matched, plus any other mail-shaped variables it noticed. If Roar uses a
naming scheme not listed above, it will show up under
`otherMailVariablesPresent`, and adding it means one line in `ENV_ALIASES` in
[src/lib/email.ts](src/lib/email.ts).

If no transport is found the dashboard says so in a red banner rather than
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
  "node": "v22.x.x",
  "database": { "ok": true, "foundAs": "DATABASE_URL" },
  "email": {
    "configured": true,
    "transport": "smtp",
    "from": "noreply@appemailalerts.com",
    "variables": { "host": "SMTP_HOST", "user": "SMTP_USER", "pass": "SMTP_PASSWORD" },
    "otherMailVariablesPresent": []
  },
  "aiGateway": { "keyPresent": true, "baseUrl": "https://cloud.roar-ai.com/v1" }
}
```

It returns `503` if either side is not ready, so it works as a deploy smoke test.
It reports variable **names only** — never a connection string, password or key.

## Testing email while the database is down

`/dashboard` needs a session, a session needs Postgres, and Postgres may be the
thing that is broken — which would leave the working half of the stack
untestable. **`/probe`** is the same email tests with no database at all.

Set `PROBE_TOKEN` in the environment to any random string, open `/probe`, enter
it once (unlocks for 8 hours via an httpOnly cookie), and tests 1 and 2 work
normally. Test 3 is shown but disabled, since it genuinely needs the database.
The page also has a button that runs the network diagnosis below.

Sends made here are **not** recorded in `email_logs` — writing a log row would
need the database this page exists to work around.

While `PROBE_TOKEN` is unset, `/probe`, `/api/email/probe` and `/api/diag` are
all inert, so an unconfigured deploy cannot be used to send mail.

### Diagnosing a database that will not connect

`/api/health` can only report that the Postgres client timed out — which looks
identical whether DNS is broken, the route is dropped, the port is closed, or a
pooler accepts TCP and never speaks. `GET /api/diag` separates them by running
DNS resolution and a raw TCP connect from inside the app container, and returns
a plain-language verdict.

Gated behind `PROBE_TOKEN` because it reveals internal hostnames and addresses.
Never returns the user or password from the connection string.

```bash
curl -s https://<your-app>/api/diag -H "x-probe-token: $PROBE_TOKEN"
```

### Testing email without a database

All three tests sit behind a login, which needs Postgres — so a broken database
blocks testing email even though email itself is fine. `POST /api/email/probe`
skips that: no session, no reads, no writes.

It is **disabled unless `PROBE_TOKEN` is set** and returns `404` when absent, so
an unconfigured deploy cannot be used as an open relay.

```bash
curl -sX POST https://<your-app>/api/email/probe \
  -H "x-probe-token: $PROBE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"you@example.com"}'
```

### Authenticated endpoints

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

## Deploying to Roar

Console → **My applications → New application**, connect GitHub, pick this repo,
and turn on both the database and email toggles. Every push to the connected
branch redeploys automatically.

`next.config.ts` sets `output: "standalone"`, which is harmless if the host runs
`next start` and necessary if it runs a bare container.

After a deploy, hit `/api/health` first. If it is green, register an account and
work through the three tests in order.

Two Roar behaviours worth knowing while testing:

- **Apps sleep when idle** and wake on the next request, so the first hit after
  a quiet period will be slow. That is a cold start, not a failure.
- Roar also injects `ROAR_API_KEY` and `ROAR_BASE_URL`, an OpenAI-compatible AI
  gateway billed to your account with per-app attribution. This app does not use
  it; `/api/health` just reports whether it is present.
