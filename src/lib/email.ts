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
 * The `from` address. The platform injects EMAIL_FROM; the rest are fallbacks
 * for local development.
 */
export function fromAddress(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    process.env.MAIL_FROM ??
    "onboarding@resend.dev"
  );
}

/**
 * Which transport is configured, if any. Exposed so the UI can tell you what
 * it is about to use before you click send — the whole point of this harness.
 */
export function detectTransport(): "smtp" | "resend" | null {
  if (process.env.SMTP_HOST) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; everything else upgrades via STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS }
      : undefined,
  });

  const info = await transporter.sendMail({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { messageId: info.messageId ?? null, transport: "smtp" };
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

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!response.ok) {
    throw new Error(body.message ?? `Resend returned ${response.status}`);
  }

  return { messageId: body.id ?? null, transport: "resend" };
}

/**
 * Send one email through whichever transport the environment provides.
 *
 * Add a branch here when the platform's own email service is documented — that
 * is the only place that needs to change.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  switch (detectTransport()) {
    case "smtp":
      return sendViaSmtp(input);
    case "resend":
      return sendViaResend(input);
    default:
      throw new Error(
        "No email transport configured. Set SMTP_HOST (plus SMTP_PORT/SMTP_USER/SMTP_PASSWORD) or RESEND_API_KEY.",
      );
  }
}
