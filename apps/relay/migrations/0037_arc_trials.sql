CREATE TABLE arc_trials (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 started_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 premium_allowance_micros INTEGER NOT NULL CHECK(premium_allowance_micros>0),
 daily_allowance_micros INTEGER NOT NULL CHECK(daily_allowance_micros>0),
 CHECK(expires_at>started_at)
);
CREATE INDEX billing_reservations_authorization ON billing_reservations(authorization_id);
