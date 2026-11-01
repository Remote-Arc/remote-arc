-- Existing sends and reviewed batches used Resend. New fields preserve that
-- history and are ignored by the previous Worker during a rolling deployment.
ALTER TABLE user_followup_messages ADD COLUMN delivery_provider TEXT NOT NULL DEFAULT 'resend' CHECK(delivery_provider IN ('resend','sendpulse'));
ALTER TABLE user_followup_messages ADD COLUMN delivery_attempted_at TEXT;
ALTER TABLE user_followup_batches ADD COLUMN delivery_provider TEXT NOT NULL DEFAULT 'resend' CHECK(delivery_provider IN ('resend','sendpulse'));
CREATE INDEX user_followup_provider_budget ON user_followup_messages(delivery_provider,COALESCE(delivery_attempted_at,sent_at,created_at)) WHERE status IN ('sending','sent','unknown');

-- No recipient address or OTP content is stored in the capacity ledger.
CREATE TABLE email_otp_deliveries (
 id TEXT PRIMARY KEY,
 provider TEXT NOT NULL CHECK(provider IN ('resend','sendpulse')),
 status TEXT NOT NULL CHECK(status IN ('sending','sent','unknown','failed')),
 attempted_at TEXT NOT NULL,
 units INTEGER NOT NULL DEFAULT 1 CHECK(units>0)
);
CREATE INDEX email_otp_capacity ON email_otp_deliveries(provider,attempted_at) WHERE status IN ('sending','sent','unknown');
CREATE INDEX email_otp_retention ON email_otp_deliveries(attempted_at);
-- Conservatively retain the known request counts of existing challenges.
INSERT INTO email_otp_deliveries(id,provider,status,attempted_at,units)
 SELECT lower(hex(randomblob(16))),'resend','unknown',requested_at,daily_count
 FROM email_login_challenges WHERE daily_count>0 AND requested_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-31 days');
