CREATE TABLE user_followup_contacts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','waiting','resolved')),
 note TEXT NOT NULL DEFAULT '', next_followup_at TEXT,
 consent_at TEXT, consent_note TEXT NOT NULL DEFAULT '',
 suppressed_at TEXT, unsubscribe_token TEXT NOT NULL UNIQUE,
 updated_at TEXT NOT NULL
);
CREATE INDEX user_followup_due ON user_followup_contacts(next_followup_at);
CREATE TABLE user_followup_messages (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL REFERENCES users(id), template_id TEXT NOT NULL,
 locale TEXT NOT NULL, recipient_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','sending','sent','failed','unknown')),
 provider_id TEXT, created_at TEXT NOT NULL, sent_at TEXT,
 error_code TEXT
);
CREATE INDEX user_followup_history ON user_followup_messages(user_id,created_at);
CREATE UNIQUE INDEX user_followup_one_dispatch ON user_followup_messages(user_id) WHERE status IN ('sending','unknown');
