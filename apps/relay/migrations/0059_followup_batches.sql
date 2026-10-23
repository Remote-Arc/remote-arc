CREATE TABLE user_followup_batches (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, template_id TEXT NOT NULL, locale TEXT NOT NULL,
 subject TEXT NOT NULL, body TEXT NOT NULL, design_json TEXT NOT NULL,
 basis TEXT NOT NULL CHECK(basis IN ('existing','support','agreed')),
 basis_note TEXT NOT NULL DEFAULT '', from_email TEXT NOT NULL, reply_to TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('preparing','draft','queued','completed','cancelled')),
 created_at TEXT NOT NULL, queued_at TEXT, finished_at TEXT
);
ALTER TABLE user_followup_messages ADD COLUMN batch_id TEXT REFERENCES user_followup_batches(id);
CREATE TABLE user_followup_batch_recipients (
 batch_id TEXT NOT NULL REFERENCES user_followup_batches(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id TEXT REFERENCES user_followup_messages(id),
 status TEXT NOT NULL CHECK(status IN ('pending','processing','sent','failed','unknown','skipped','cancelled')),
 error_code TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(batch_id,user_id)
);
CREATE INDEX user_followup_batch_queue ON user_followup_batches(status,created_at);
CREATE INDEX user_followup_batch_pending ON user_followup_batch_recipients(status,next_attempt_at);
CREATE INDEX user_followup_message_batch ON user_followup_messages(batch_id);
CREATE TABLE user_followup_dispatch_lease (
 id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, expires_at TEXT NOT NULL
);
INSERT INTO user_followup_dispatch_lease(id,expires_at) VALUES(1,'1970-01-01T00:00:00.000Z');
CREATE UNIQUE INDEX user_followup_batch_message ON user_followup_batch_recipients(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX user_followup_batch_user ON user_followup_batch_recipients(user_id,status);
