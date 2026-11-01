-- One-time secrets a user enters for an AI task. Only metadata is kept here:
-- the value is encrypted in the user's browser to a key made on the device for
-- this one request, and the Relay forwards the ciphertext without storing it.
CREATE TABLE IF NOT EXISTS secret_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  client_id TEXT,
  purpose TEXT NOT NULL,
  site TEXT,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  delivered_at TEXT,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_secret_requests_user
ON secret_requests(user_id, created_at DESC);
