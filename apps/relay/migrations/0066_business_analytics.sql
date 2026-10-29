-- Business funnels have one row per real attempt, not per HTTP request/poll.
CREATE TABLE business_flow_attempts (
 id TEXT PRIMARY KEY,
 scene TEXT NOT NULL CHECK(scene IN ('email_login','google_login','device_pairing')),
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 device_id TEXT,
 dimension TEXT,
 started_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 succeeded_at TEXT,
 failed_at TEXT,
 failure_reason TEXT,
 evidence TEXT NOT NULL DEFAULT 'observed' CHECK(evidence IN ('observed','ledger'))
);
CREATE INDEX business_flow_scene_time ON business_flow_attempts(scene,started_at);
CREATE INDEX business_flow_device ON business_flow_attempts(device_id);
CREATE INDEX business_flow_user ON business_flow_attempts(user_id,started_at);
CREATE TABLE business_flow_steps (
 flow_id TEXT NOT NULL REFERENCES business_flow_attempts(id) ON DELETE CASCADE,
 step TEXT NOT NULL,
 occurred_at TEXT NOT NULL,
 PRIMARY KEY(flow_id,step)
);
CREATE TABLE business_activity_days (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 first_at TEXT NOT NULL,
 last_at TEXT NOT NULL,
 PRIMARY KEY(user_id,day)
);
CREATE INDEX business_activity_day ON business_activity_days(day,user_id);
-- Account deletion must not silently shrink historical retention cohorts.
CREATE TABLE business_cohort_users (
 id TEXT PRIMARY KEY,
 user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
 registered_at TEXT NOT NULL,
 is_demo INTEGER NOT NULL DEFAULT 0,
 returned_d1 INTEGER NOT NULL DEFAULT 0,
 returned_d7 INTEGER NOT NULL DEFAULT 0,
 returned_d30 INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX business_cohort_registered ON business_cohort_users(registered_at);
INSERT INTO business_cohort_users(id,user_id,registered_at,is_demo)
 SELECT lower(hex(randomblob(16))),id,created_at,CASE WHEN id='reviewer-openai-v1' THEN 1 ELSE 0 END FROM users;
CREATE TRIGGER business_user_registered AFTER INSERT ON users BEGIN
 INSERT INTO business_cohort_users(id,user_id,registered_at,is_demo)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.created_at,CASE WHEN NEW.id='reviewer-openai-v1' THEN 1 ELSE 0 END);
END;
CREATE TABLE business_metrics_state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO business_metrics_state VALUES
 ('flow_since',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 -- A partial deployment day must not be reported as a fully observed zero.
 ('activity_complete_from',strftime('%Y-%m-%dT00:00:00.000Z','now','+1 day'));
ALTER TABLE arc_billing_checkouts ADD COLUMN receipt_id TEXT;
ALTER TABLE arc_billing_checkouts ADD COLUMN completed_at TEXT;
CREATE INDEX business_checkout_receipt ON arc_billing_checkouts(receipt_id);
CREATE INDEX business_checkout_created ON arc_billing_checkouts(created_at,user_id);
CREATE INDEX business_checkout_journey ON arc_billing_checkouts(journey_id,user_id,created_at);
CREATE INDEX business_user_created ON users(created_at);
CREATE INDEX business_receipt_verified ON arc_payment_receipts(verified_at);
UPDATE arc_billing_checkouts SET completed_at=(SELECT MIN(p.occurred_at) FROM product_events p
 WHERE p.name='billing.purchase.completed' AND p.source='stripe' AND p.entity_id=arc_billing_checkouts.session_id)
 WHERE status='complete';

-- Existing ledger evidence is retained as evidence, without inventing timing.
INSERT INTO business_flow_attempts(id,scene,user_id,device_id,dimension,started_at,expires_at,evidence)
 SELECT 'device:'||device_code_hash,'device_pairing',approved_user_id,approved_device_id,
 platform,created_at,expires_at,'ledger' FROM device_pairings;
INSERT INTO business_flow_steps SELECT 'device:'||device_code_hash,'started',created_at FROM device_pairings;
INSERT INTO business_flow_steps SELECT 'device:'||device_code_hash,'approved',approved_at
 FROM device_pairings WHERE approved_at IS NOT NULL;
INSERT INTO business_flow_steps SELECT 'device:'||device_code_hash,'credential',approved_at
 FROM device_pairings WHERE status='consumed' AND approved_at IS NOT NULL;
-- last_seen can be a heartbeat or a failed socket attempt. It is not proof of
-- an authenticated WebSocket upgrade, so no historical online step is invented.

-- Positive historical activity is useful; missing historical days remain unknown.
INSERT OR IGNORE INTO business_activity_days
 SELECT user_id,substr(created_at,1,10),MIN(created_at),MAX(created_at)
 FROM sessions GROUP BY user_id,substr(created_at,1,10);
INSERT INTO business_activity_days
 SELECT user_id,substr(occurred_at,1,10),MIN(occurred_at),MAX(occurred_at)
 FROM product_events WHERE user_id IS NOT NULL AND outcome<>'failed'
 AND name IN ('auth.session.created','page.viewed','device.tool.completed','task.request','app.request')
 GROUP BY user_id,substr(occurred_at,1,10)
 ON CONFLICT(user_id,day) DO UPDATE SET first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at);
INSERT INTO business_activity_days
 SELECT user_id,substr(created_at,1,10),MIN(created_at),MAX(created_at)
 FROM arc_chat_runs WHERE automation_id IS NULL GROUP BY user_id,substr(created_at,1,10)
 ON CONFLICT(user_id,day) DO UPDATE SET first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at);
INSERT INTO business_activity_days
 SELECT user_id,substr(created_at,1,10),MIN(created_at),MAX(created_at)
 FROM app_calls WHERE status='succeeded' GROUP BY user_id,substr(created_at,1,10)
 ON CONFLICT(user_id,day) DO UPDATE SET first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at);
UPDATE business_cohort_users SET
 returned_d1=EXISTS(SELECT 1 FROM business_activity_days a WHERE a.user_id=business_cohort_users.user_id AND a.day=date(registered_at,'+1 day')),
 returned_d7=EXISTS(SELECT 1 FROM business_activity_days a WHERE a.user_id=business_cohort_users.user_id AND a.day=date(registered_at,'+7 day')),
 returned_d30=EXISTS(SELECT 1 FROM business_activity_days a WHERE a.user_id=business_cohort_users.user_id AND a.day=date(registered_at,'+30 day'));
