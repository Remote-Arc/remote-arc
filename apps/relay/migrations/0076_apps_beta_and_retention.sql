-- Additive rollout. Applying this migration does not delete existing content.
ALTER TABLE app_calls ADD COLUMN content_purged_at TEXT;
CREATE INDEX idx_app_calls_retention ON app_calls(created_at) WHERE content_purged_at IS NULL;
CREATE INDEX idx_app_calls_connection ON app_calls(connection_id,created_at);

CREATE TABLE google_app_beta_requests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  providers_json TEXT NOT NULL,
  support_thread_id TEXT NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_google_app_beta_thread ON google_app_beta_requests(support_thread_id);
