-- Individually auditable additional computer slots, separate from subscription/Plus.
CREATE TABLE device_capacity_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extra_devices INTEGER NOT NULL CHECK(extra_devices BETWEEN 1 AND 20),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_device_capacity_grants_active
ON device_capacity_grants(user_id,revoked_at,expires_at);
