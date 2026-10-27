CREATE TABLE product_events (
 id TEXT PRIMARY KEY,
 occurred_at TEXT NOT NULL,
 domain TEXT NOT NULL,
 name TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('browser','server','stripe')),
 outcome TEXT NOT NULL CHECK(outcome IN ('succeeded','accepted','failed','waiting')),
 user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 journey_id TEXT,
 trace_id TEXT NOT NULL,
 entity_id TEXT,
 route TEXT,
 error_code TEXT,
 http_status INTEGER,
 duration_ms INTEGER,
 deployment TEXT
);
CREATE INDEX product_events_time ON product_events(occurred_at DESC,id DESC);
CREATE INDEX product_events_user ON product_events(user_id,occurred_at DESC);
CREATE INDEX product_events_journey ON product_events(journey_id,occurred_at DESC);
CREATE INDEX product_events_name ON product_events(name,occurred_at DESC);
CREATE INDEX product_events_trace ON product_events(trace_id);
ALTER TABLE arc_billing_checkouts ADD COLUMN journey_id TEXT;
ALTER TABLE arc_billing_checkouts ADD COLUMN trace_id TEXT;

CREATE UNIQUE INDEX product_events_canonical ON product_events(name,entity_id) WHERE source='stripe' AND name IN ('billing.purchase.completed','billing.entitlement.granted','billing.webhook.processed');
