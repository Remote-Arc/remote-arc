CREATE TABLE arc_memory_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  generation INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE arc_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('fact','work')),
  category TEXT NOT NULL CHECK(category IN ('preference','project','context','work')),
  content_ciphertext TEXT NOT NULL,
  content_bytes INTEGER NOT NULL CHECK(content_bytes BETWEEN 1 AND 2048),
  source_session_id TEXT,
  source_run_id TEXT,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,kind,fingerprint)
);
CREATE INDEX arc_memories_owner_kind ON arc_memories(user_id,kind,updated_at DESC);
