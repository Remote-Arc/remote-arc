-- A chat can wait for user-controlled account authorization without inference.
CREATE TABLE arc_app_connection_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_run_id TEXT NOT NULL REFERENCES arc_chat_runs(id) ON DELETE CASCADE,
 source_step INTEGER NOT NULL,
 provider TEXT NOT NULL,
 required_operation TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resumed','cancelled')),
 connection_id TEXT REFERENCES app_connections(id),
 remaining_ms INTEGER NOT NULL,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(source_run_id,source_step)
);
CREATE INDEX arc_app_connection_source ON arc_app_connection_requests(source_run_id,status);
