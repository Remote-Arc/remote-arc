-- Checkout Sessions with ui_mode=elements: Remote Arc renders the checkout and
-- Stripe renders only the themed Payment Element. Widen the frozen UI-mode
-- check; SQLite can only change a CHECK by rebuilding the table.
-- No table references arc_billing_checkouts, and every row is copied as is.
CREATE TABLE arc_billing_checkouts_next (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), product_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('subscription','payment')), session_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('creating','open','complete','expired')),
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
 commercial_version_id TEXT REFERENCES arc_commercial_versions(id), promotion_id TEXT,
 ui_mode TEXT NOT NULL DEFAULT 'hosted_page' CHECK(ui_mode IN ('hosted_page','embedded_page','elements')),
 journey_id TEXT, trace_id TEXT, receipt_id TEXT, completed_at TEXT
);
INSERT INTO arc_billing_checkouts_next(id,user_id,product_id,kind,session_id,status,expires_at,created_at,commercial_version_id,promotion_id,ui_mode,journey_id,trace_id,receipt_id,completed_at)
SELECT id,user_id,product_id,kind,session_id,status,expires_at,created_at,commercial_version_id,promotion_id,ui_mode,journey_id,trace_id,receipt_id,completed_at FROM arc_billing_checkouts;
DROP TABLE arc_billing_checkouts;
ALTER TABLE arc_billing_checkouts_next RENAME TO arc_billing_checkouts;
CREATE UNIQUE INDEX arc_one_subscription_checkout ON arc_billing_checkouts(user_id)
 WHERE kind='subscription' AND status IN ('creating','open');
CREATE INDEX business_checkout_receipt ON arc_billing_checkouts(receipt_id);
CREATE INDEX business_checkout_created ON arc_billing_checkouts(created_at,user_id);
CREATE INDEX business_checkout_journey ON arc_billing_checkouts(journey_id,user_id,created_at);
