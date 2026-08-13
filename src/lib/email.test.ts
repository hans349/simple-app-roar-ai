import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeEmailEnv, detectTransport, fromAddress } from "./email";

const MAIL_KEYS = /(^|_)(SMTP|MAIL|EMAIL|SENDGRID|POSTMARK|RESEND|SES)/i;

let original: NodeJS.ProcessEnv;

beforeEach(() => {
  original = process.env;
  // Start from a clean slate so the developer's own .env cannot skew results.
  const stripped = { ...process.env };
  for (const key of Object.keys(stripped)) {
    if (MAIL_KEYS.test(key)) delete stripped[key];
  }
  process.env = stripped;
});

afterEach(() => {
  process.env = original;
});

describe("detectTransport", () => {
  it("returns null when nothing is configured", () => {
    expect(detectTransport()).toBeNull();
  });

  it("prefers a connection URL over discrete host variables", () => {
    process.env.SMTP_URL = "smtp://user:pass@mail.example.com:587";
    process.env.SMTP_HOST = "mail.example.com";
    expect(detectTransport()).toBe("smtp-url");
  });

  it("detects SMTP under alternative naming schemes", () => {
    process.env.EMAIL_SERVER_HOST = "mail.example.com";
    expect(detectTransport()).toBe("smtp");
  });

  it("falls back to Resend only when no SMTP variables exist", () => {
    process.env.RESEND_API_KEY = "placeholder";
    expect(detectTransport()).toBe("resend");

    process.env.MAIL_HOST = "mail.example.com";
    expect(detectTransport()).toBe("smtp");
  });
});

describe("fromAddress", () => {
  it("reads EMAIL_FROM first", () => {
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.MAIL_FROM = "other@example.com";
    expect(fromAddress()).toBe("noreply@example.com");
  });

  it("accepts an alternative name", () => {
    process.env.MAIL_FROM = "other@example.com";
    expect(fromAddress()).toBe("other@example.com");
  });
});

describe("describeEmailEnv", () => {
  it("reports the names it matched, never the values", () => {
    process.env.EMAIL_SERVER_HOST = "mail.example.com";
    process.env.SMTP_PASSWORD = "hunter2";

    const { found } = describeEmailEnv();
    expect(found).toMatchObject({ host: "EMAIL_SERVER_HOST", pass: "SMTP_PASSWORD" });
    expect(JSON.stringify(found)).not.toContain("hunter2");
    expect(JSON.stringify(found)).not.toContain("mail.example.com");
  });

  it("surfaces unrecognised mail variables so an unknown scheme is still visible", () => {
    process.env.POSTMARK_SERVER_TOKEN = "placeholder";
    expect(describeEmailEnv().otherCandidates).toContain("POSTMARK_SERVER_TOKEN");
  });

  it("does not list an already-reported variable a second time", () => {
    process.env.RESEND_API_KEY = "placeholder";
    const { found, otherCandidates } = describeEmailEnv();
    expect(found.resend).toBe("RESEND_API_KEY");
    expect(otherCandidates).not.toContain("RESEND_API_KEY");
  });

  it("ignores variables that are set but empty", () => {
    process.env.SMTP_HOST = "";
    expect(detectTransport()).toBeNull();
  });
});
