# Roar AI Cloud — platform test findings

Results from deploying this harness to Roar AI Cloud and exercising the database
and email services from inside a running app container.

- **App:** `simple-app-roar-ai`
- **URL:** https://simple-app-roar-ai-fd47.roarai.app
- **Date:** 2026-08-13
- **Runtime observed:** Node v22.23.2, `APP_ENVIRONMENT=production`

## Summary

| Subsystem | Status |
|-----------|--------|
| GitHub deploy, build, auto-redeploy on push | Working |
| Environment variable injection | Working |
| Email sending | Working |
| AI gateway credentials injected | Present (not exercised) |
| **Managed Postgres** | **Unreachable from the app container** |

---

## F1 — Managed Postgres is unreachable from app containers

**Severity: blocking.** No app that uses the database can function.

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

### What this rules out

- **Not TLS.** Plaintext and TLS fail identically, so it is not a certificate
  or `sslmode` problem.
- **Not credentials.** Authentication is never reached; the TCP handshake does
  not complete.
- **Not DNS.** The host is a literal IP, so no name resolution is involved.
- **Not a dead service.** Connections are **dropped, not refused**. A closed
  port returns `ECONNREFUSED` in under 100 ms. A full 4–5 second silence means
  packets are discarded with no response, so PgBouncer may well be healthy.

### Most likely cause

`100.64.0.2` is in `100.64.0.0/10` — RFC 6598 shared address space. That range
is not ordinary RFC 1918 private addressing; it is what overlay networks
allocate (Tailscale tailnets, various Kubernetes CNIs, Fly-style private
networks).

Combined with the drop-not-refuse signature, this points to **the app container
having no route onto the network the database lives on**, rather than a firewall
rule blocking one port on an otherwise reachable host.

Worth checking, in order:

1. Whether app containers are attached to the same overlay network as the
   database at all — and if the overlay needs a client or sidecar, whether it is
   running and authorized in the app container.
2. Whether the app container's route table covers `100.64.0.0/10`. If nothing
   matches, traffic goes to the default gateway and disappears — producing
   exactly these silent timeouts.
3. Whether the database provisioned into a different network or region than the
   app runtime. Common when the two are provisioned by separate services.

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
