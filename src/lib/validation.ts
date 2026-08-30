export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Deliberately loose: the point of this harness is to test delivery, not to
// re-litigate RFC 5322. Reject only what is obviously not an address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

export function parseEmail(value: unknown, field = "email"): ValidationResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `${field} is required` };
  }
  const trimmed = value.trim();
  if (!isValidEmail(trimmed)) {
    return { ok: false, error: `${field} is not a valid email address` };
  }
  return { ok: true, value: trimmed.toLowerCase() };
}

export function parsePassword(value: unknown): ValidationResult<string> {
  if (typeof value !== "string" || value === "") {
    return { ok: false, error: "password is required" };
  }
  if (value.length < 8) {
    return { ok: false, error: "password must be at least 8 characters" };
  }
  if (value.length > 200) {
    return { ok: false, error: "password must be at most 200 characters" };
  }
  return { ok: true, value };
}

export function parseText(
  value: unknown,
  field: string,
  { min = 1, max = 5000 }: { min?: number; max?: number } = {},
): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return { ok: false, error: `${field} is required` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${field} must be at most ${max} characters` };
  }
  return { ok: true, value: trimmed };
}

export function parseQuantity(value: unknown): ValidationResult<number> {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) {
    return { ok: false, error: "quantity must be a whole number" };
  }
  if (n < 1 || n > 10_000) {
    return { ok: false, error: "quantity must be between 1 and 10000" };
  }
  return { ok: true, value: n };
}
