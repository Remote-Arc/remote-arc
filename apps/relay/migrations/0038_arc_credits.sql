-- Credits are a product allowance, never a cash/deposit balance. Connect call
-- allowances and provider spending limits remain independent controls.
CREATE TABLE arc_payment_receipts (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider='stripe'),
 event_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('paid','refunded')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0), currency TEXT NOT NULL CHECK(currency='usd'),
 period_start TEXT, period_end TEXT, verified_at TEXT NOT NULL, payload_hash TEXT NOT NULL
);
CREATE TABLE arc_credit_lots (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source TEXT NOT NULL CHECK(source IN ('trial','subscription','topup','promotion')),
 source_ref TEXT NOT NULL UNIQUE, granted_units INTEGER NOT NULL CHECK(granted_units>0),
 spent_units INTEGER NOT NULL DEFAULT 0 CHECK(spent_units>=0),
 reserved_units INTEGER NOT NULL DEFAULT 0 CHECK(reserved_units>=0),
 starts_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, reason TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL,
 CHECK(spent_units+reserved_units<=granted_units)
);
CREATE INDEX arc_credit_lots_available ON arc_credit_lots(user_id,revoked_at,expires_at);
CREATE TABLE arc_credit_allocations (
 reservation_id TEXT NOT NULL REFERENCES billing_reservations(id),
 lot_id TEXT NOT NULL REFERENCES arc_credit_lots(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, units INTEGER NOT NULL CHECK(units>0),
 spent_units INTEGER NOT NULL DEFAULT 0 CHECK(spent_units>=0 AND spent_units<=units),
 PRIMARY KEY(reservation_id,lot_id), UNIQUE(reservation_id,ordinal)
);
CREATE TABLE arc_credit_events (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('granted','settled','revoked')),
 lot_id TEXT REFERENCES arc_credit_lots(id) ON DELETE SET NULL,
 reservation_id TEXT REFERENCES billing_reservations(id),
 units INTEGER NOT NULL CHECK(units>=0), reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX arc_credit_events_user ON arc_credit_events(user_id,created_at);
CREATE TABLE arc_payment_events (
 id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('processing','processed','failed')),
 created_at TEXT NOT NULL, completed_at TEXT
);

INSERT INTO billing_plans(id,lane,features_json,created_at) VALUES
 ('arc-plus-v1','arc_hosted','["apps","hosted_inference","paid_models"]',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('arc-pro-v1','arc_hosted','["apps","hosted_inference","paid_models"]',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
