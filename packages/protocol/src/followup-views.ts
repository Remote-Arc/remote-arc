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
