-- Phase 1: additive, opt-in accounting. No Connect quota or subscription changes.
CREATE TABLE billing_budgets (
  scope_type TEXT NOT NULL CHECK(scope_type IN ('global','organization','user','task')),
  scope_id TEXT NOT NULL, lane TEXT NOT NULL CHECK(lane IN ('connect','arc_hosted')),
  metric TEXT NOT NULL CHECK(metric IN ('credits','cost_micros','neurons')),
  period_key TEXT NOT NULL,
  limit_units INTEGER NOT NULL CHECK(limit_units >= 0),
  spent_units INTEGER NOT NULL DEFAULT 0 CHECK(spent_units >= 0),
  reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(scope_type,scope_id,lane,metric,period_key),
  CHECK(spent_units + reserved_units <= limit_units)
);
CREATE TABLE billing_model_grants (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES automations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('openai','anthropic')),
  max_cost_micros INTEGER NOT NULL CHECK(max_cost_micros > 0),
  expires_at TEXT NOT NULL, revoked_at TEXT,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX billing_model_grants_actor ON billing_model_grants(user_id,organization_id,provider);
CREATE TABLE billing_free_ai_pools (
  id TEXT PRIMARY KEY, period_key TEXT NOT NULL,
  ownership_mode TEXT NOT NULL CHECK(ownership_mode IN ('dedicated_account','all_usage_managed')),
  managed_pool_assertion INTEGER NOT NULL CHECK(managed_pool_assertion = 1),
  free_neurons INTEGER NOT NULL CHECK(free_neurons > 0 AND free_neurons <= 10000),
  outside_used_neurons INTEGER NOT NULL CHECK(outside_used_neurons >= 0),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  verified_at TEXT NOT NULL,
  CHECK(outside_used_neurons < free_neurons)
);
CREATE TABLE billing_reservations (
  id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE,
  -- Historical opaque IDs remain for cost reconciliation after account/task deletion.
  -- Live ownership is checked in the atomic reservation INSERT, not by foreign keys.
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL, lane TEXT NOT NULL CHECK(lane IN ('connect','arc_hosted')),
  provider TEXT NOT NULL, model_id TEXT NOT NULL, authorization_id TEXT NOT NULL,
  request_json TEXT NOT NULL, entries_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','unknown','settling','completed','failed')),
  accounted INTEGER NOT NULL DEFAULT 0 CHECK(accounted IN (0,1)),
  settlement_json TEXT, created_at TEXT NOT NULL, settled_at TEXT
);
CREATE INDEX billing_reservations_actor ON billing_reservations(user_id,organization_id,created_at);
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES billing_reservations(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('reserved','unknown','settled')),
  details_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(reservation_id,event_type)
);

-- Product entitlements are independent from budgets and provider grants.
CREATE TABLE billing_plans (
  id TEXT PRIMARY KEY, lane TEXT NOT NULL CHECK(lane IN ('connect','arc_hosted')),
  features_json TEXT NOT NULL CHECK(json_valid(features_json)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TABLE billing_plan_assignments (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  subject_type TEXT NOT NULL CHECK(subject_type IN ('user','organization')),
  subject_id TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL
);
CREATE INDEX billing_plan_assignments_subject ON billing_plan_assignments(subject_type,subject_id);
