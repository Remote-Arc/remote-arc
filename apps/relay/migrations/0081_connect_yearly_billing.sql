-- Yearly billing for Connect Unlimited. Schema only: no existing row changes.
-- A published commercial version may carry a second, yearly Stripe price next
-- to its monthly one. Existing versions keep stripe_yearly_price_id NULL, and
-- existing subscriptions and open checkouts read as monthly through the default.
ALTER TABLE arc_commercial_versions ADD COLUMN stripe_yearly_price_id TEXT;
CREATE UNIQUE INDEX arc_commercial_versions_yearly_price
 ON arc_commercial_versions(stripe_yearly_price_id) WHERE stripe_yearly_price_id IS NOT NULL;

ALTER TABLE arc_billing_subscriptions ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month'
 CHECK(billing_interval IN ('month','year'));
-- The interval of pending_product_id. NULL whenever no change is pending.
ALTER TABLE arc_billing_subscriptions ADD COLUMN pending_billing_interval TEXT
 CHECK(pending_billing_interval IS NULL OR pending_billing_interval IN ('month','year'));

ALTER TABLE arc_billing_checkouts ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month'
 CHECK(billing_interval IN ('month','year'));
