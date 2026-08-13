import { describe, expect, it } from "vitest";
import { customEmail, escapeHtml, itemReceiptEmail, staticEmail } from "./templates";

describe("escapeHtml", () => {
  it("neutralises tags and quotes", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("customEmail", () => {
  it("keeps the plain-text body verbatim", () => {
    const email = customEmail("Subject", "Line one\n\nLine two");
    expect(email.text).toBe("Line one\n\nLine two");
  });

  it("splits blank-line-separated paragraphs", () => {
    const email = customEmail("Subject", "One\n\nTwo");
    expect(email.html.match(/<p /g)).toHaveLength(2);
  });

  it("does not let user input inject markup", () => {
    const email = customEmail("Subject", "<img src=x onerror=alert(1)>");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });
});

describe("staticEmail", () => {
  it("uses the same fixed body every time", () => {
    expect(staticEmail().text).toBe(staticEmail().text);
    expect(staticEmail().text).toContain("Lorem ipsum dolor sit amet");
  });
});

describe("itemReceiptEmail", () => {
  const item = { id: "0f4d9c1e-0000-4000-8000-000000000000", name: "Blue widget", quantity: 3 };

  it("includes the row details in both parts", () => {
    const email = itemReceiptEmail(item);
    for (const part of [email.text, email.html]) {
      expect(part).toContain("Blue widget");
      expect(part).toContain("3");
      expect(part).toContain(item.id);
    }
  });

  it("escapes the item name in the subject-derived heading", () => {
    const email = itemReceiptEmail({ ...item, name: "<b>bold</b>" });
    expect(email.html).not.toContain("<b>bold</b>");
  });
});
