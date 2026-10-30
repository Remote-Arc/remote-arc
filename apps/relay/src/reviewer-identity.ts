export const REVIEWER_USER_IDS = ["reviewer-openai-v1", "reviewer-anthropic-v1"] as const;

export type ReviewerConfig = {
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  ANTHROPIC_REVIEWER_EMAIL?: string;
  ANTHROPIC_REVIEWER_PASSWORD_SHA256?: string;
  ANTHROPIC_REVIEWER_DEMO_DEVICE_ID?: string;
};

export function reviewerAccounts(env: ReviewerConfig) {
  return [
    { email: env.REVIEWER_EMAIL?.trim().toLowerCase(), passwordHash: env.REVIEWER_PASSWORD_SHA256,
      userId: REVIEWER_USER_IDS[0], displayName: "OpenAI Reviewer", deviceId: env.REVIEWER_DEMO_DEVICE_ID },
    { email: env.ANTHROPIC_REVIEWER_EMAIL?.trim().toLowerCase(), passwordHash: env.ANTHROPIC_REVIEWER_PASSWORD_SHA256,
      userId: REVIEWER_USER_IDS[1], displayName: "Anthropic Reviewer", deviceId: env.ANTHROPIC_REVIEWER_DEMO_DEVICE_ID },
  ];
}

export function isReviewerUserId(userId: string | null | undefined) {
  return REVIEWER_USER_IDS.some(id => id === userId);
}

export function isReviewerEmail(env: ReviewerConfig, email: string) {
  const normalized = email.trim().toLowerCase();
  return reviewerAccounts(env).some(account => account.email && account.email === normalized);
}

/** A configured fixture ID alone never makes a real user's device a review fixture. */
export function isReviewerFixture(env: ReviewerConfig, userId: string, deviceId: string) {
  const accounts = reviewerAccounts(env).filter(account => account.deviceId && account.deviceId === deviceId);
  return accounts.length === 1 && accounts[0]!.userId === userId;
}
