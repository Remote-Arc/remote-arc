-- Outbox for product lifecycle emails: welcome after sign-up, Connect
-- Unlimited trial started and ending, and paid plan confirmation. Events
-- queue a row once per (user, kind, ref); a scheduled sender delivers queued
-- rows through SendPulse within the shared email account capacity. An
-- uncertain delivery is never retried, so a person never gets duplicates.
-- Email language, from the browser's Accept-Language at sign-up or sign-in.
-- NULL means unknown, and emails then use English.
ALTER TABLE users ADD COLUMN locale TEXT CHECK(locale IN ('en','zh'));

CREATE TABLE lifecycle_emails (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('welcome','connect_trial_started','connect_trial_ending','plan_started')),
 ref TEXT NOT NULL DEFAULT '',
 details_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','unknown','skipped')),
 provider TEXT,
 provider_id TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL,
 attempted_at TEXT,
 sent_at TEXT,
 UNIQUE(user_id, kind, ref)
);
CREATE INDEX lifecycle_emails_queue ON lifecycle_emails(status, created_at);
CREATE INDEX lifecycle_emails_usage ON lifecycle_emails(provider, attempted_at);

-- Only accounts created from now on are welcomed; the store reviewer is not.
CREATE TRIGGER lifecycle_email_welcome AFTER INSERT ON users
WHEN NEW.id <> 'reviewer-openai-v1'
BEGIN
 INSERT OR IGNORE INTO lifecycle_emails(id,user_id,kind,ref,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,'welcome','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TRIGGER lifecycle_email_trial_started AFTER INSERT ON connect_unlimited_trials
BEGIN
 INSERT OR IGNORE INTO lifecycle_emails(id,user_id,kind,ref,details_json,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.user_id,'connect_trial_started','',
  json_object('endsAt',NEW.ends_at),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
