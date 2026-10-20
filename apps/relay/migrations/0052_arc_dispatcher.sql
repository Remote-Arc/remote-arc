-- Background routing is control-plane work; it does not create a billable employee.
CREATE TABLE arc_dispatches (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_run_id TEXT NOT NULL REFERENCES arc_chat_runs(id) ON DELETE CASCADE,
 source_message_id TEXT NOT NULL REFERENCES arc_chat_messages(id) ON DELETE CASCADE,
 source_step INTEGER NOT NULL,root_id TEXT NOT NULL,depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 8),
 target_kind TEXT NOT NULL CHECK(target_kind IN ('employee','team')),target_id TEXT NOT NULL,
 target_version INTEGER NOT NULL,room_id TEXT NOT NULL,turn_id TEXT,
 input_hash TEXT NOT NULL,input_ciphertext TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('prepared','queued','reported')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(source_run_id,source_step)
);
CREATE INDEX arc_dispatches_owner ON arc_dispatches(user_id,created_at,id);
CREATE INDEX arc_dispatches_root ON arc_dispatches(root_id,user_id);
ALTER TABLE arc_room_turns ADD COLUMN source_dispatch_id TEXT REFERENCES arc_dispatches(id) ON DELETE CASCADE;
