-- Optional lifetime budget shared by related employee/continuation runs.
-- Existing account/day/funding gates continue to apply independently.
CREATE TABLE arc_execution_budgets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 task_id TEXT NOT NULL,
 limit_units INTEGER NOT NULL CHECK(limit_units > 0 AND limit_units <= 1000000000),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','cancelled')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX arc_execution_budgets_owner ON arc_execution_budgets(user_id,task_id,created_at);
