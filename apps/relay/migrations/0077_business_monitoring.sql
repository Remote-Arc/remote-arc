-- Additive only: existing product events and all previous writers remain valid.
ALTER TABLE product_events ADD COLUMN failure_category TEXT;
ALTER TABLE product_events ADD COLUMN device_id TEXT;
ALTER TABLE product_events ADD COLUMN app_provider TEXT;
ALTER TABLE product_events ADD COLUMN operation TEXT;
CREATE INDEX product_events_failures ON product_events(occurred_at DESC,id DESC) WHERE outcome='failed';
CREATE INDEX product_events_failure_code ON product_events(error_code,occurred_at DESC,id DESC) WHERE outcome='failed';
CREATE INDEX product_events_failure_device ON product_events(device_id,occurred_at DESC) WHERE outcome='failed';
