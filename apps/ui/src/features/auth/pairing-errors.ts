import type { Translate } from "../../locales/locale-catalog.js";
import { canonicalErrorCode } from "../../../../../packages/protocol/src/error-codes.js";

export type PairingFailure = {
  error?: string;
  limit?: number | null;
  device_type?: string;
};

export const atComputerLimit = (failure: PairingFailure) =>
  canonicalErrorCode(failure.error) === "DEVICE_LIMIT_REACHED" &&
  failure.device_type === "computer";

/** Turns /api/pairing/approve failures into text a person can act on. */
export function pairingFailureMessage(failure: PairingFailure, tr: Translate) {
  failure = { ...failure, error: canonicalErrorCode(failure.error) || failure.error };
  if (atComputerLimit(failure)) {
    return tr("auth.pairingErrors.thisAccountHasReachedItsLimit", { limit: failure.limit });
  }
  if (failure.error === "DEVICE_LIMIT_REACHED") {
    return tr("auth.pairingErrors.thisAccountHasReachedItsLimit2", { limit: failure.limit });
  }
  if (failure.error === "DEVICE_REGISTRATION_RATE_LIMITED") {
    return tr("auth.pairingErrors.tooManyNewComputersWereAdded");
  }
  if (failure.error === "PAIRING_CHANGED" || failure.error === "Pairing is no longer pending") {
    return tr("auth.pairingErrors.thisPairingCodeWasAlreadyUsed");
  }
  return failure.error || tr("auth.pairingErrors.couldNotApproveDevice");
}
