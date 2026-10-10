-- Account-specific monthly extra calls; additive grants remain auditable.
-- Quotas revert to plan defaults at the next UTC month.
CREATE TABLE IF NOT EXISTS user_call_credit_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  extra_calls INTEGER NOT NULL CHECK(extra_calls > 0 AND extra_calls <= 100000),
  reason TEXT NOT NULL,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_credit_user_month
  ON user_call_credit_grants(user_id, month_key);
