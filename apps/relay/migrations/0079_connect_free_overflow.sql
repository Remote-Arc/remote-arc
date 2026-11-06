-- What a Free account gets after its monthly Connect calls run out.
-- The first time, a one-off reverse trial with unlimited calls starts
-- automatically. After it ends, calls keep working at a published slow-lane
-- pace until the monthly allowance resets. Both tables are additive.
CREATE TABLE connect_unlimited_trials (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 started_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 month_key TEXT NOT NULL,
 base_limit INTEGER NOT NULL CHECK(base_limit > 0)
);
CREATE INDEX connect_unlimited_trials_started ON connect_unlimited_trials(started_at);

-- One row per account: when the last slow-lane call was allowed, and this
-- month's slow-lane total so real demand past the allowance stays measurable.
CREATE TABLE connect_slow_lane_usage (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 last_call_at TEXT NOT NULL,
 month_key TEXT NOT NULL,
 month_calls INTEGER NOT NULL CHECK(month_calls >= 0),
 updated_at TEXT NOT NULL
);
