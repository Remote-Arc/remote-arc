-- Native Arc conversations share the existing durable task scheduler.
CREATE TABLE arc_chat_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id), title_ciphertext TEXT NOT NULL,
 model_id TEXT NOT NULL DEFAULT 'auto', automation_id TEXT REFERENCES automations(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX arc_chat_sessions_owner ON arc_chat_sessions(user_id,updated_at);
CREATE TABLE arc_chat_runs (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES arc_chat_sessions(id),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL,
 input_hash TEXT NOT NULL, model_id TEXT NOT NULL, automation_id TEXT REFERENCES automations(id),
 status TEXT NOT NULL CHECK(status IN ('queued','thinking','working','succeeded','failed','cancelled','unknown')),
 step INTEGER NOT NULL DEFAULT 0, tokens_used INTEGER NOT NULL DEFAULT 0, max_tokens INTEGER NOT NULL,
 max_steps INTEGER NOT NULL, deadline TEXT NOT NULL, cancel_requested INTEGER NOT NULL DEFAULT 0,
 error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,request_id)
);
CREATE UNIQUE INDEX arc_chat_one_active_run ON arc_chat_runs(session_id) WHERE status IN ('queued','thinking','working');
CREATE TABLE arc_chat_messages (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES arc_chat_sessions(id),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, run_id TEXT REFERENCES arc_chat_runs(id),
 role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')), body_ciphertext TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX arc_chat_messages_session ON arc_chat_messages(session_id,created_at,id);
CREATE TABLE arc_chat_steps (
 run_id TEXT NOT NULL REFERENCES arc_chat_runs(id), step INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('model_pending','model_complete','dispatching','done','unknown')),
 decision_ciphertext TEXT, result_ciphertext TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(run_id,step)
);
