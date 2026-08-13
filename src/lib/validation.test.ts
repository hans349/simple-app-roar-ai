import { describe, expect, it } from "vitest";
import { parseEmail, parsePassword, parseQuantity, parseText } from "./validation";

describe("parseEmail", () => {
  it("trims and lowercases", () => {
    expect(parseEmail("  Test@Example.COM  ")).toEqual({ ok: true, value: "test@example.com" });
  });

  it.each([undefined, null, "", "   ", "nope", "a@b", "a b@example.com", 42])(
    "rejects %p",
    (input) => {
      expect(parseEmail(input).ok).toBe(false);
    },
  );

  it("names the field in the error", () => {
    const result = parseEmail("", "recipient");
    expect(result).toEqual({ ok: false, error: "recipient is required" });
  });
});

describe("parsePassword", () => {
  it("accepts 8 characters or more", () => {
    expect(parsePassword("12345678").ok).toBe(true);
  });

  it("rejects short passwords", () => {
    expect(parsePassword("1234567")).toEqual({
      ok: false,
      error: "password must be at least 8 characters",
    });
  });

  it("rejects absurdly long passwords", () => {
    expect(parsePassword("x".repeat(201)).ok).toBe(false);
  });
});

describe("parseText", () => {
  it("trims the value", () => {
    expect(parseText("  hello  ", "body")).toEqual({ ok: true, value: "hello" });
  });

  it("treats whitespace-only as missing", () => {
    expect(parseText("   ", "body")).toEqual({ ok: false, error: "body is required" });
  });

  it("enforces the max length", () => {
    expect(parseText("x".repeat(11), "subject", { max: 10 })).toEqual({
      ok: false,
      error: "subject must be at most 10 characters",
    });
  });
});

describe("parseQuantity", () => {
  it("coerces numeric strings", () => {
    expect(parseQuantity("3")).toEqual({ ok: true, value: 3 });
  });

  it.each([0, -1, 1.5, 10_001, "abc", null])("rejects %p", (input) => {
    expect(parseQuantity(input).ok).toBe(false);
  });
});
