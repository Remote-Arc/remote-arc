CREATE TABLE arc_billing_customers (
 user_id TEXT PRIMARY KEY REFERENCES users(id), customer_id TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL
);
CREATE TABLE arc_billing_checkouts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('subscription','payment')), session_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('creating','open','complete','expired')),
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX arc_one_subscription_checkout ON arc_billing_checkouts(user_id)
 WHERE kind='subscription' AND status IN ('creating','open');
CREATE TABLE arc_billing_subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL,
 status TEXT NOT NULL, period_end TEXT NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 pending_product_id TEXT, pending_effective_at TEXT,
 revision INTEGER NOT NULL DEFAULT 0, change_lease_token TEXT, change_lease_until TEXT,
 updated_at TEXT NOT NULL
);
CREATE INDEX arc_billing_subscriptions_user ON arc_billing_subscriptions(user_id,period_end);
CREATE TABLE arc_payment_links (
 receipt_id TEXT NOT NULL REFERENCES arc_payment_receipts(id),
 payment_intent_id TEXT NOT NULL, charge_id TEXT NOT NULL,
 PRIMARY KEY(receipt_id,payment_intent_id)
);
CREATE INDEX arc_payment_links_charge ON arc_payment_links(charge_id);
CREATE TABLE arc_payment_blocks (
 payment_intent_id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
ALTER TABLE arc_payment_events ADD COLUMN lease_until TEXT;
ALTER TABLE arc_payment_events ADD COLUMN lease_token TEXT;
ALTER TABLE arc_payment_events ADD COLUMN error_code TEXT;
CREATE TABLE arc_connect_legacy_allowances (
 user_id TEXT PRIMARY KEY REFERENCES users(id), monthly_calls INTEGER NOT NULL CHECK(monthly_calls>0)
);
-- Preserve existing Free allowances. New accounts receive the new finite Free quota.
INSERT INTO arc_connect_legacy_allowances SELECT id,10000 FROM users;
CREATE TABLE app_platform_funding_reservations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL,
 month_key TEXT NOT NULL, day_key TEXT NOT NULL, maximum_cost_micros INTEGER NOT NULL CHECK(maximum_cost_micros>0),
 created_at TEXT NOT NULL
);
CREATE INDEX app_platform_funding_user ON app_platform_funding_reservations(user_id,month_key);
CREATE INDEX app_platform_funding_day ON app_platform_funding_reservations(provider,day_key);
