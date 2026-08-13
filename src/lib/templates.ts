export const LOREM_IPSUM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod " +
  "tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, " +
  "quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo " +
  "consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse " +
  "cillum dolore eu fugiat nulla pariatur.";

export const STATIC_SUBJECT = "Test 2 — static email from simple-app-roar-ai";

/** Escape untrusted text before it goes into an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <h1 style="margin:0;font-size:18px;line-height:1.4;">${escapeHtml(heading)}</h1>
        </td>
      </tr>
      <tr><td style="padding:8px 28px 28px;font-size:14px;line-height:1.65;color:#3f3f46;">${bodyHtml}</td></tr>
      <tr>
        <td style="padding:0 28px 24px;font-size:12px;color:#a1a1aa;border-top:1px solid #f4f4f5;padding-top:16px;">
          Sent by simple-app-roar-ai — a throwaway harness for testing database and email delivery.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Test 1 — recipient and body both chosen by the user. */
export function customEmail(subject: string, body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return {
    subject,
    text: body,
    html: layout(subject, paragraphs),
  };
}

/** Test 2 — fixed subject and body, recipient still chosen by the user. */
export function staticEmail() {
  return {
    subject: STATIC_SUBJECT,
    text: LOREM_IPSUM,
    html: layout(STATIC_SUBJECT, `<p style="margin:0 0 12px;">${escapeHtml(LOREM_IPSUM)}</p>`),
  };
}

/** Test 3 — receipt for a row that was just written to the database. */
export function itemReceiptEmail(item: { id: string; name: string; quantity: number }) {
  const subject = `Test 3 — saved "${item.name}" to the database`;
  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:6px 0;color:#71717a;width:96px;">${escapeHtml(label)}</td>
       <td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td>
     </tr>`;

  return {
    subject,
    text: `A record was written to the database.\n\nItem: ${item.name}\nQuantity: ${item.quantity}\nRow ID: ${item.id}`,
    html: layout(
      "Record saved",
      `<p style="margin:0 0 16px;">This row was just inserted into the <code>items</code> table:</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
         ${row("Item", item.name)}
         ${row("Quantity", String(item.quantity))}
         ${row("Row ID", item.id)}
       </table>
       <p style="margin:16px 0 0;">If this email arrived, the database write and the email send both worked.</p>`,
    ),
  };
}
