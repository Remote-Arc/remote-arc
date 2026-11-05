import { canonicalErrorEnvelope } from "../../../../packages/protocol/src/error-codes.js";

/** First-party JSON only. OAuth error responses use their protocol serializer. */
export function applicationJson(body: unknown, init?: ResponseInit): Response {
  return Response.json(canonicalErrorEnvelope(body, (init?.status ?? 200) >= 400), init);
}
