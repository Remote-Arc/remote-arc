-- Support mailbox is separate from marketing follow-ups. Only authenticated Admin
-- sessions can read it; bodies are encrypted at the application layer.
CREATE TABLE IF NOT EXISTS support_threads (
  id TEXT PRIMARY KEY,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','waiting','resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_threads_recent ON support_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_threads_sender_subject ON support_threads(sender_email,subject_key,last_message_at);
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES support_threads(id),
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_encrypted TEXT NOT NULL,
  external_message_id TEXT UNIQUE,
  in_reply_to TEXT,
  provider_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'received' CHECK(delivery_status IN ('received','sending','sent','failed','unknown')),
  error_code TEXT,
  delivery_review_note TEXT,
  delivery_reviewed_at TEXT,
  delivery_reviewed_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_messages_thread ON support_messages(thread_id,created_at);
-- Unknown provider submissions must never be blindly sent again.
CREATE UNIQUE INDEX IF NOT EXISTS support_single_uncertain_send ON support_messages(thread_id) WHERE direction='outbound' AND delivery_status IN ('sending','unknown');
