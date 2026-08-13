import nodemailer from "nodemailer";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = {
  messageId: string | null;
  transport: string;
};

/**
 * Roar's docs say email credentials arrive as "standard SMTP-style variables"
 * without naming them, so accept every common spelling rather than betting on
 * one. `describeEmailEnv()` reports which names were actually found, which is
 * how you confirm the real ones after a deploy.
 */
const ENV_ALIASES = {
  url: ["SMTP_URL", "MAIL_URL", "EMAIL_SERVER", "EMAIL_URL"],
  host: ["SMTP_HOST", "MAIL_HOST", "EMAIL_SERVER_HOST", "MAILER_HOST", "SMTP_SERVER"],
  port: ["SMTP_PORT", "MAIL_PORT", "EMAIL_SERVER_PORT", "MAILER_PORT"],
  user: [
    "SMTP_USER",
    "SMTP_USERNAME",
    "SMTP_LOGIN",
    "MAIL_USER",
    "MAIL_USERNAME",
    "EMAIL_SERVER_USER",
    "MAILER_USER",
  ],
  pass: [
    "SMTP_PASSWORD",
    "SMTP_PASS",
    "MAIL_PASSWORD",
    "MAIL_PASS",
    "EMAIL_SERVER_PASSWORD",
    "MAILER_PASSWORD",
  ],
  from: ["EMAIL_FROM", "SMTP_FROM", "MAIL_FROM", "EMAIL_SERVER_FROM"],
} as const;

/** First alias that is set, with the name it was found under. */
function lookup(names: readonly string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return { name, value: value.trim() };
  }
  return null;
}

export function fromAddress(): string {
  return lookup(ENV_ALIASES.from)?.value ?? "onboarding@resend.dev";
}

export type TransportKind = "smtp-url" | "smtp" | "resend" | null;

/**
 * Which transport is configured, if any. Exposed so the dashboard can say what
 * it is about to use before you click send.
 */
export function detectTransport(): TransportKind {
  if (lookup(ENV_ALIASES.url)) return "smtp-url";
  if (lookup(ENV_ALIASES.host)) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

/**
 * Which variable names were found — names only, never values.
 *
 * This is the diagnostic that matters on an undocumented host: deploy, hit
 * /api/health, and read back exactly what the platform injected.
 */
export function describeEmailEnv() {
  const found: Record<string, string> = {};
  for (const [role, names] of Object.entries(ENV_ALIASES)) {
    const hit = lookup(names);
    if (hit) found[role] = hit.name;
  }
  if (process.env.RESEND_API_KEY) found.resend = "RESEND_API_KEY";

  // Anything else that looks mail-related, so an unexpected naming scheme is
  // still visible rather than silently ignored. Names already reported above
  // are excluded, otherwise they show up twice and read like a second finding.
  const known = new Set([
    ...(Object.values(ENV_ALIASES).flat() as string[]),
    ...Object.values(found),
  ]);
  const otherCandidates = Object.keys(process.env)
    .filter((k) => /(^|_)(SMTP|MAIL|EMAIL|SENDGRID|POSTMARK|RESEND|SES)/i.test(k))
    .filter((k) => !known.has(k))
    .sort();

  return { found, otherCandidates };
}

function buildTransporter() {
  const url = lookup(ENV_ALIASES.url);
  if (url) return nodemailer.createTransport(url.value);

  const host = lookup(ENV_ALIASES.host);
  const port = Number(lookup(ENV_ALIASES.port)?.value ?? 587);
  const user = lookup(ENV_ALIASES.user);
  const pass = lookup(ENV_ALIASES.pass);

  return nodemailer.createTransport({
    host: host?.value,
    port,
    // 465 is implicit TLS; everything else upgrades via STARTTLS.
    secure: port === 465,
    auth: user && pass ? { user: user.value, pass: pass.value } : undefined,
  });
}

async function sendViaSmtp(input: SendEmailInput, kind: string): Promise<SendEmailResult> {
  const info = await buildTransporter().sendMail({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { messageId: info.messageId ?? null, transport: kind };
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) throw new Error(body.message ?? `Resend returned ${response.status}`);

  return { messageId: body.id ?? null, transport: "resend" };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const kind = detectTransport();
  switch (kind) {
    case "smtp-url":
    case "smtp":
      return sendViaSmtp(input, kind);
    case "resend":
      return sendViaResend(input);
    default:
      throw new Error(
        "No email transport configured. Expected SMTP-style variables (SMTP_HOST/SMTP_URL or a MAIL_*/EMAIL_SERVER_* equivalent) or RESEND_API_KEY. Check /api/health to see what the platform injected.",
      );
  }
}
