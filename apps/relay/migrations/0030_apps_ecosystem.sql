-- Additive, default-off Apps foundation. Device/login OAuth ownership is unchanged.
CREATE TABLE app_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('github','slack','gmail','outlook','google_calendar','microsoft_calendar')),
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','reauthorization_required','disconnected')),
  permissions_json TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  token_ciphertext TEXT,
  expires_at TEXT,
  generation INTEGER NOT NULL DEFAULT 1,
  refresh_lease TEXT,
  refresh_lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,provider,account_id)
);
CREATE INDEX idx_app_connections_user ON app_connections(user_id,status);
CREATE TABLE app_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_app_oauth_expiry ON app_oauth_states(expires_at);
CREATE TABLE app_calls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES app_connections(id),
  connection_generation INTEGER NOT NULL,
  operation TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('read','write')),
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  arguments_ciphertext TEXT NOT NULL,
  result_ciphertext TEXT,
  review_ciphertext TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending_approval','approved','running','succeeded','failed','unknown','rejected','cancelled')),
  error_code TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,request_id)
);
CREATE INDEX idx_app_calls_user_status ON app_calls(user_id,status,created_at);
