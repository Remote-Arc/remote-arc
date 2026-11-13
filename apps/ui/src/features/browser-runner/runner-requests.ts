import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";

export class RunnerRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export async function requestJSON(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response
      .json()
      .then(canonicalErrorEnvelope)
      .catch(() => ({}));
    throw new RunnerRequestError(
      typeof result.error === "string" ? result.error : "request_failed",
    );
  }
  return response.json().then(canonicalErrorEnvelope);
}
