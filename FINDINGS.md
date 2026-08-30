# Roar AI Cloud — platform test findings

Results from deploying this harness to Roar AI Cloud and exercising the database
and email services from inside a running app container.

- **App:** `simple-app-roar-ai`
- **URL:** https://simple-app-roar-ai-65c0.roarai.app (was `-fd47` before the app
  was recreated; the old hostname went NXDOMAIN)
- **Date:** 2026-08-13, updated 2026-08-30
- **Runtime observed:** Node v24.19.0 (was v22.23.2), `APP_ENVIRONMENT=production`

## Summary

| Subsystem | Status |
|-----------|--------|
| GitHub deploy, build, auto-redeploy on push | Working |
| Environment variable injection | Working |
| Email sending | Worked, then stopped after recreation — see F7 |
| AI gateway credentials injected | Present (not exercised) |
| Managed Postgres reachability | Resolved — see F1 |
| **Managed Postgres TLS** | **Not supported at all — see F6** |
| **Email after app recreation** | **Credentials no longer injected — see F7** |

---

## F1 — Managed Postgres was unreachable from app containers

**Status: RESOLVED** as of the app being recreated (new URL suffix `-65c0`,
runtime moved from Node v22.23.2 to v24.19.0). The database now connects:

```json
"database": { "ok": true, "foundAs": "DATABASE_URL", "port": "6432", "ssl": false }
```

Whether the routing was fixed or recreation simply placed the app on the right
network is not visible from here. Original report follows, since the diagnostic
path is worth keeping and F3 remains unaddressed.

**Severity when open: blocking.** No app that used the database could function.

`DATABASE_URL` is injected and well-formed, but no connection can be
established. Measured from inside the app container:

```json
{
  "target": { "host": "100.64.0.2", "port": 6432, "foundAs": "DATABASE_URL" },
  "dns":    { "ok": true, "ms": 1, "addresses": ["100.64.0.2 (IPv4)"] },
  "tcp":    { "ok": false, "ms": 5003, "error": "no response within 5000ms" }
}
```

Postgres-level attempts, both with and without TLS, time out identically:

```json
"attempts": [
  { "ssl": true,  "ok": false, "ms": 8010, "error": "Connection terminated due to connection timeout" },
  { "ssl": false, "ok": false, "ms": 8008, "error": "Connection terminated due to connection timeout" }
]
```

A later attempt returned a different and more explicit error:

```
connect EHOSTUNREACH 100.64.0.2:6432
```

`EHOSTUNREACH` is not a timeout. The network stack rejects the connection
immediately — either the local routing table has no entry matching the
destination, or a router replied ICMP host-unreachable. Both observations
describe the same fault; this one states it outright.

### What this rules out

- **Not TLS.** Plaintext and TLS fail identically, so it is not a certificate
  or `sslmode` problem.
- **Not credentials.** Authentication is never reached; the TCP handshake does
  not complete.
- **Not DNS.** The host is a literal IP, so no name resolution is involved.
- **Not a firewall.** A firewall that drops is silent (the original timeout); one
  that rejects returns `ECONNREFUSED`. `EHOSTUNREACH` is neither — it is the
  absence of a route.
- **Not a dead service.** Nothing ever reaches the pooler, so PgBouncer may well
  be healthy. Its state is untestable from here.

### Most likely cause

`100.64.0.2` is in `100.64.0.0/10` — RFC 6598 shared address space. That range
is not ordinary RFC 1918 private addressing; it is what overlay networks
allocate (Tailscale tailnets, various Kubernetes CNIs, Fly-style private
networks).

Combined with the drop-not-refuse signature, this points to **the app container
having no route onto the network the database lives on**, rather than a firewall
rule blocking one port on an otherwise reachable host.

### Railway-specific leads

The platform runs on Railway, whose private networking has properties that fit
these symptoms closely. Worth checking in this order:

1. **Are the app service and the Postgres service in the same Railway project
   *and* environment?** Railway's private network only spans a single
   project+environment pair. A service outside it has no route to the database
   at all — which is precisely `EHOSTUNREACH`. If Roar provisions customer apps
   and their databases into separate projects, no per-app configuration can fix
   this; the topology has to change.

2. **Is the app receiving the private `DATABASE_URL` where it needs the public
   one?** Railway Postgres exposes both a private endpoint and a
   `DATABASE_PUBLIC_URL` TCP proxy reachable from anywhere. If apps run outside
   the database's project, the public URL is the working option and the private
   one cannot be made to work.

3. **Railway's private network is IPv6.** Services address each other as
   `*.railway.internal`, resolving to IPv6. The injected value here is an IPv4
   CGNAT address, so something is proxying or translating between the two — and
   that layer is a candidate for the fault.

4. **Railway's private network is not up at the instant a container starts.**
   There is a short delay before it becomes usable, so anything connecting
   immediately on boot can fail. This would produce intermittent rather than
   persistent failures, so it does not explain what is seen here, but it is
   worth knowing for apps that connect eagerly at startup.

---

### What to ask the platform team

1. Are deployed apps and their managed Postgres in the same Railway project and
   environment? If not, private networking cannot reach across, and the fix is
   topological rather than per-app.
2. Can apps be given `DATABASE_PUBLIC_URL` instead — or as well — so there is a
   working path today?
3. Is there any supported way to reach a managed database directly for
   verification: a SQL console, `psql` access, or a port-forward? Currently
   there is no way to confirm the database is even running.
4. What is the intended migration path (see F4)? Related, since both need some
   route to the database.

---

## F2 — Documentation misdescribes how email credentials are injected

**Severity: high.** Costs every customer debugging time on first deploy.

`/docs/apps` states:

> Email credentials — Standard SMTP-style variables most frameworks pick up
> automatically (if enabled).

What is actually injected is **`RESEND_API_KEY`** plus `EMAIL_FROM`. No SMTP
variables are present at all:

```json
"email": {
  "configured": true,
  "transport": "resend",
  "from": "noreply@appemailalerts.com",
  "variables": { "from": "EMAIL_FROM", "resend": "RESEND_API_KEY" }
}
```

Two problems with the current wording:

- An API key is not "SMTP-style", so anyone following the docs will configure an
  SMTP transport and find nothing to connect to.
- Frameworks do **not** pick up `RESEND_API_KEY` automatically the way they pick
  up `SMTP_HOST`/`SMTP_PORT`. It requires the Resend SDK or a direct HTTP call.

Naming the variables explicitly, with a two-line send example, would remove the
guesswork entirely. This harness had to accept `SMTP_*`, `MAIL_*`,
`EMAIL_SERVER_*`, `MAILER_*` *and* `RESEND_API_KEY` to avoid betting on one.

---

## F3 — `DATABASE_URL` hardcodes an IP address

**Severity: medium.** A latent fleet-wide outage.

The injected connection string points at `100.64.0.2` directly rather than a
hostname. Every deployed app therefore bakes in that address.

If the pooler is ever rescheduled, replaced or moved, **every customer app
breaks simultaneously**, with the same opaque `Connection terminated due to
connection timeout` seen in F1 — and no redeploy will fix it until the IP
matches again.

Injecting a DNS name would make relocation transparent, and would turn this
class of failure into a resolvable, diagnosable error instead of a silent
timeout.

---

## F4 — No documented way to run schema migrations

**Severity: low.** Design question rather than a defect.

The platform provisions Postgres but exposes no SQL console, migration step or
shell. This harness works around it by issuing `CREATE TABLE IF NOT EXISTS` on
first query, which is acceptable for a throwaway app and not acceptable for a
real one.

Also relevant: `CREATE EXTENSION` appears to need rights a managed database may
not grant, so anything depending on `pgcrypto`, `uuid-ossp` or similar needs a
documented answer. (`gen_random_uuid()` is built in from Postgres 13, so this
harness treats the extension as optional.)

Worth documenting what the intended migration path is.

---

## F5 — No authentication service

**Severity: informational.** Not a defect; a scope note.

The platform offers database and email toggles but no auth. Apps needing
accounts must implement their own — this harness does, with scrypt password
hashing and hashed session tokens in Postgres. Fine, but worth stating in the
docs so it is not a surprise mid-build.

---

## F6 — Managed Postgres does not support TLS

**Severity: high.** Both a compatibility trap and a security concern.

The database refuses TLS outright, and the injected `DATABASE_URL` does not say
so. Measured across two attempts:

```json
"attempts": [
  { "ssl": true,  "ok": false, "ms": 9,   "error": "The server does not support SSL connections" },
  { "ssl": false, "ok": true,  "ms": 134 }
]
```

Two separate problems:

1. **Clients that attempt TLS fail.** This harness only connects because it
   retries without TLS after an explicit refusal. A stock client, or an ORM
   configured for a managed database, will attempt SSL, get refused, and stop.
   Nothing in the connection string signals this — appending `?sslmode=disable`
   to the injected URL would at least make the behaviour explicit and let
   standard clients configure themselves correctly.

2. **Application-to-database traffic is unencrypted.** Credentials and row data
   cross the network in plaintext. Acceptable only if that path is fully trusted
   and isolated; worth stating explicitly in the docs either way, since users
   handling personal or regulated data need to know before they build on it.

---

## F7 — Email credentials are not injected after an app is recreated

**Severity: high.** Silent loss of a working capability.

The app previously had email working via an injected `RESEND_API_KEY`. After
recreation, both that and `EMAIL_FROM` are absent:

```json
"email": { "configured": false, "transport": null, "variables": {}, "otherMailVariablesPresent": [] }
```

The app falls back to a default sender and cannot send at all. Whether the email
toggle defaulted off during recreation or injection failed is not visible from
inside the container.

Worth checking whether recreating an app preserves its service toggles. If it
does not, that is a data-loss-shaped surprise: the app deploys successfully,
reports healthy, and silently cannot send mail until someone tests it.

---

## Confirmed working

**Email delivery.** Tests 1 (custom recipient, subject and body) and 2 (fixed
body, chosen recipient) both send successfully via Resend from
`noreply@appemailalerts.com`.

**Deploy pipeline.** GitHub connect, build, and redeploy-on-push all worked
without intervention. Next.js was detected and built with no configuration
beyond the repo itself.

**Environment injection.** `DATABASE_URL`, `EMAIL_FROM`, `RESEND_API_KEY`,
`APP_NAME`, `APP_ENVIRONMENT`, `APP_URL`, `APP_PUBLIC_URL`, `ROAR_API_KEY` and
`ROAR_BASE_URL` were all present and readable.

---

## Open questions

1. **Does `noreply@appemailalerts.com` deliver to arbitrary external domains, or
   only to addresses tied to the account?** Sends to a personal-domain address
   confirmed working; delivery to an unrelated external domain is not yet
   verified. If the shared domain is restricted, that is a significant
   constraint for anything customer-facing and should be documented.
2. **Are there send rate limits on the shared domain, and what happens on
   exceeding them?** Not tested.
3. **What are the cold-start characteristics?** Apps sleep when idle. The first
   request after a quiet period took roughly 16 s here, though most of that was
   two 8 s database timeouts, so the true cold-start cost is unmeasured.
4. **Is test 3 (write a row, then email a receipt) viable?** Blocked entirely by
   F1 and untested.

---

## Reproducing

Everything above is observable from two endpoints on the deployed app:

```bash
# Public: readiness, injected variable names, transport in use
curl -s https://<app>/api/health

# Requires PROBE_TOKEN: DNS, raw TCP, address-range classification
curl -s https://<app>/api/diag -H "x-probe-token: $PROBE_TOKEN"
```

Both report variable **names** only, never values. `/probe` runs the email tests
in the browser with no database involvement, which is how F2 and the email
results above were confirmed while F1 was outstanding.
