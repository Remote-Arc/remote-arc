/** Saved views in Admin → User follow-ups for a founder contacting people one by
 * one. Each answers "who should I talk to now, and why". The Relay evaluates
 * each one with a single uncorrelated subquery, so they stay cheap to page. */
export const FOLLOWUP_SAVED_VIEWS = [
  "paying",
  "trial-ending",
  "cancel-scheduled",
  "free-allowance",
  "checkout-open",
  "google-beta-pending",
  "google-beta-unconnected",
] as const;
export type FollowupSavedView = (typeof FOLLOWUP_SAVED_VIEWS)[number];
export const isFollowupSavedView = (value: string): value is FollowupSavedView =>
  (FOLLOWUP_SAVED_VIEWS as readonly string[]).includes(value);

/** A trial counts as ending soon this many days before its end. */
export const FOLLOWUP_TRIAL_ENDING_DAYS = 3;
/** Checkouts opened within this many days count as recent. */
export const FOLLOWUP_CHECKOUT_DAYS = 30;
/** A search shorter than this never matches user IDs by prefix. */
export const FOLLOWUP_ID_PREFIX_MIN = 6;

/** No follow-up to the same person within this time of the last one sent. */
export const FOLLOWUP_COOLDOWN_MS = 72 * 3600000;
/** A one-to-one personal email may skip the cooldown with a reason, but never
 * this soon after the last email, so a double click cannot send twice. */
export const FOLLOWUP_OVERRIDE_MIN_GAP_MS = 10 * 60000;
/** Shortest and longest reason for skipping the cooldown. */
export const FOLLOWUP_OVERRIDE_REASON = { min: 8, max: 300 } as const;
