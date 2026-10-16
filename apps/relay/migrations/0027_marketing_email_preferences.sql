-- Optional promotional email preferences; default is no marketing consent.
-- Consent is never inferred from creating an account or receiving OTP.
CREATE TABLE IF NOT EXISTS marketing_email_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  opted_in INTEGER NOT NULL DEFAULT 0 CHECK(opted_in IN (0,1)),
  consented_at TEXT,
  consent_source TEXT,
  unsubscribed_at TEXT,
  last_campaign_sent_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marketing_eligible
 ON marketing_email_preferences(opted_in, last_campaign_sent_at);
