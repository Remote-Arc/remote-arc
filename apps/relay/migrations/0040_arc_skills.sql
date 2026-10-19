CREATE TABLE arc_skills (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 description TEXT NOT NULL,
 source_url TEXT,
 content_ciphertext TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id,content_hash)
);
CREATE INDEX arc_skills_user ON arc_skills(user_id,created_at);
