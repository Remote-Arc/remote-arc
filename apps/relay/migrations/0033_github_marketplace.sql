-- Store a provider-side mirror; never infer a Remote Arc user from a GitHub login.
CREATE TABLE github_marketplace_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action TEXT NOT NULL,
  account_id INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX idx_marketplace_delivery_account ON github_marketplace_deliveries(account_id, received_at);
CREATE TABLE github_marketplace_subscriptions (
  account_id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT,
  plan_id INTEGER,
  plan_name TEXT,
  billing_cycle TEXT,
  unit_count INTEGER,
  on_free_trial INTEGER NOT NULL DEFAULT 0,
  free_trial_ends_on TEXT,
  next_billing_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','cancelled')),
  effective_date TEXT NOT NULL,
  last_delivery_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE github_marketplace_pending_changes (
  account_id INTEGER PRIMARY KEY,
  plan_id INTEGER,
  plan_name TEXT,
  effective_date TEXT NOT NULL,
  last_delivery_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
