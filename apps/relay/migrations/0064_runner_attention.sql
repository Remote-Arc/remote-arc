ALTER TABLE devices ADD COLUMN runner_attention_mode TEXT NOT NULL DEFAULT 'show_and_notify';
CREATE TABLE runner_session_links (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL,
 run_id TEXT,
 PRIMARY KEY(user_id,device_id,session_id)
);
CREATE TABLE runner_attention (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 origin TEXT NOT NULL,
 run_id TEXT,
 created_at TEXT NOT NULL,
 resolved_at TEXT,
 reminded_at TEXT,
 slack_notified_at TEXT,
 slack_reminded_at TEXT,
 UNIQUE(user_id,device_id,session_id,event_id)
);
CREATE INDEX runner_attention_owner ON runner_attention(user_id,resolved_at,created_at);
CREATE INDEX runner_attention_run ON runner_attention(user_id,run_id,created_at);
