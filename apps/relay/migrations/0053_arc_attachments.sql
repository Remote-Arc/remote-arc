CREATE TABLE IF NOT EXISTS arc_attachments (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 upload_key TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 2097152),
 meta_ciphertext TEXT NOT NULL,
 session_id TEXT REFERENCES arc_chat_sessions(id),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 UNIQUE(user_id,upload_key)
);
CREATE INDEX IF NOT EXISTS arc_attachments_owner ON arc_attachments(user_id,expires_at);
CREATE INDEX IF NOT EXISTS arc_attachments_expiry ON arc_attachments(expires_at);
CREATE TABLE IF NOT EXISTS arc_attachment_chunks (
 attachment_id TEXT NOT NULL REFERENCES arc_attachments(id) ON DELETE CASCADE,
 part INTEGER NOT NULL,
 body_ciphertext TEXT NOT NULL,
 PRIMARY KEY(attachment_id,part)
);
