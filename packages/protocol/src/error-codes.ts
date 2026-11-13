/** Application error identifiers use UPPER_SNAKE_CASE. Accept legacy casing at
 * read boundaries; messages, provider payloads and numeric protocol codes are
 * not application identifiers. */
export function canonicalErrorCode(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/.test(value) ||
    value.length > 100
  )
    return undefined;
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/** Only the application envelope is normalized. Never walk arbitrary provider
 * data, message contents or successful result objects. */
export function canonicalErrorEnvelope<T>(value: T, failed = false): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  let result = body;
  const set = (key: string, next: unknown) => {
    if (next === body[key]) return;
    if (result === body) result = { ...body };
    result[key] = next;
  };
  for (const key of ["errorCode", "error_code"])
    if (key in body) set(key, canonicalErrorCode(body[key]) ?? body[key]);
  if (typeof body.error === "string") set("error", canonicalErrorCode(body.error) ?? body.error);
  else if (body.error && typeof body.error === "object" && !Array.isArray(body.error)) {
    const error = body.error as Record<string, unknown>,
      code = canonicalErrorCode(error.code);
    if (code && code !== error.code) set("error", { ...error, code });
  }
  if (failed || body.ok === false || body.status === "failed" || body.status === "unknown") {
    if ("code" in body) set("code", canonicalErrorCode(body.code) ?? body.code);
  }
  return result as T;
}
