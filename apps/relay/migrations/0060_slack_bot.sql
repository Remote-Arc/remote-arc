-- Workspace installation is distinct from each initiating user's Arc identity.
CREATE TABLE slack_bot_installations (
  team_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  installer_user_id TEXT NOT NULL REFERENCES users(id),
  token_ciphertext TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  generation INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE slack_bot_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE slack_arc_links (
  team_id TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(team_id,slack_user_id)
);
CREATE INDEX idx_slack_links_owner ON slack_arc_links(user_id,status);
CREATE TABLE slack_arc_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL DEFAULT 'auto',
  updated_at TEXT NOT NULL
);
CREATE TABLE slack_arc_link_requests (
  code_hash TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE slack_arc_conversations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  slack_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  session_id TEXT NOT NULL,
  UNIQUE(team_id,slack_user_id,user_id,channel_id,thread_key)
);
CREATE TABLE slack_arc_events (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  slack_user_id TEXT,
  channel_id TEXT,
  thread_ts TEXT,
  event_type TEXT NOT NULL,
  body_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT,
  run_id TEXT,
  reply_channel TEXT,
  reply_ts TEXT,
  reply_ciphertext TEXT,
  delivery_kind TEXT,
  lease TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(team_id,id)
);
CREATE INDEX idx_slack_events_work ON slack_arc_events(status,next_attempt_at,lease_until);
CREATE INDEX idx_slack_events_run ON slack_arc_events(run_id,status);
CREATE INDEX idx_slack_events_rate ON slack_arc_events(team_id,slack_user_id,created_at);
