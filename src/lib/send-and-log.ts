import { sendEmail } from "./email";
import { query } from "./db";

export type SendKind = "custom" | "static" | "item_receipt";

export type SendOutcome = {
  ok: boolean;
  messageId: string | null;
  transport: string | null;
  error: string | null;
};

/**
 * Send an email and record the attempt in `email_logs` either way.
 *
 * Failures are logged and returned, not thrown — a failed send is a valid test
 * result and we want it visible in the UI and in the table.
 */
export async function sendAndLog(params: {
  userId: string;
  kind: SendKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  itemId?: string | null;
}): Promise<SendOutcome> {
  try {
    const result = await sendEmail({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    await query(
      `insert into email_logs (user_id, test_kind, to_email, subject, status, provider_message_id, item_id)
       values ($1, $2, $3, $4, 'sent', $5, $6)`,
      [params.userId, params.kind, params.to, params.subject, result.messageId, params.itemId ?? null],
    );

    return { ok: true, messageId: result.messageId, transport: result.transport, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Best-effort: if the database is the thing that is broken, don't mask the
    // original send error with an insert error.
    await query(
      `insert into email_logs (user_id, test_kind, to_email, subject, status, error, item_id)
       values ($1, $2, $3, $4, 'failed', $5, $6)`,
      [params.userId, params.kind, params.to, params.subject, message, params.itemId ?? null],
    ).catch(() => undefined);

    return { ok: false, messageId: null, transport: null, error: message };
  }
}
