ALTER TABLE arc_funding_policy ADD COLUMN mode TEXT NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual','automatic'));
ALTER TABLE arc_funding_policy ADD COLUMN paid_user_daily_micros INTEGER NOT NULL DEFAULT 1000000 CHECK(paid_user_daily_micros BETWEEN 1 AND 1000000000);
-- Preserve the owner's existing sponsored budget and all committed cost.
UPDATE arc_funding_policy SET mode='automatic',revision=revision+1 WHERE managed=1;
CREATE TABLE arc_funding_allocations (
 reservation_id TEXT PRIMARY KEY REFERENCES billing_reservations(id),
 pool TEXT NOT NULL CHECK(pool IN ('sponsored','paid'))
);
-- Freeze historical classification. Later refunds must not move paid usage
-- into the free-trial pool or erase already incurred provider cost.
INSERT INTO arc_funding_allocations
 SELECT r.id,CASE WHEN EXISTS(SELECT 1 FROM billing_plan_assignments a
  WHERE a.subject_type='user' AND a.subject_id=r.user_id AND a.plan_id IN ('arc-plus-v1','arc-pro-v1')
  AND a.created_at<=r.created_at AND a.expires_at>r.created_at AND (a.revoked_at IS NULL OR a.revoked_at>r.created_at))
  AND EXISTS(SELECT 1 FROM arc_payment_receipts p LEFT JOIN arc_commercial_versions v ON v.id=p.commercial_version_id WHERE p.user_id=r.user_id AND p.provider='stripe'
   AND p.currency='usd' AND p.state IN ('paid','refunded') AND p.verified_at<=r.created_at AND v.mode='live')
  THEN 'paid' ELSE 'sponsored' END
 FROM billing_reservations r JOIN arc_funding_policy p ON p.id=1 AND p.managed=1 AND r.created_at>=p.started_at
 WHERE r.lane='arc_hosted';
CREATE INDEX arc_funding_allocation_pool ON arc_funding_allocations(pool,reservation_id);
CREATE TRIGGER arc_funding_allocation_keep BEFORE UPDATE ON arc_funding_allocations BEGIN SELECT RAISE(ABORT,'ARC_FUNDING_ALLOCATION_IMMUTABLE'); END;
CREATE TRIGGER arc_funding_allocation_retain BEFORE DELETE ON arc_funding_allocations BEGIN SELECT RAISE(ABORT,'ARC_FUNDING_ALLOCATION_IMMUTABLE'); END;
CREATE TABLE arc_funding_pool_counters(pool TEXT NOT NULL,period_key TEXT NOT NULL,spent INTEGER NOT NULL CHECK(spent>=0),reserved INTEGER NOT NULL CHECK(reserved>=0),PRIMARY KEY(pool,period_key));
INSERT INTO arc_funding_pool_counters
 SELECT a.pool,substr(r.created_at,1,10),
  SUM(CASE WHEN r.status IN ('completed','failed') THEN COALESCE(json_extract(r.settlement_json,'$.actual.costMicros'),0) ELSE 0 END) spent,
  SUM(CASE WHEN r.status NOT IN ('completed','failed') THEN json_extract(r.request_json,'$.maximum.costMicros') ELSE 0 END) reserved
 FROM arc_funding_allocations a JOIN billing_reservations r ON r.id=a.reservation_id GROUP BY a.pool,substr(r.created_at,1,10);
INSERT INTO arc_funding_pool_counters SELECT pool,'all',SUM(spent),SUM(reserved) FROM arc_funding_pool_counters GROUP BY pool;
CREATE VIEW arc_funding_pool_usage AS SELECT pool,period_key day,spent,reserved FROM arc_funding_pool_counters WHERE period_key<>'all';
CREATE TRIGGER arc_funding_pool_reserve AFTER INSERT ON arc_funding_allocations
 BEGIN
  INSERT INTO arc_funding_pool_counters SELECT NEW.pool,'all',0,json_extract(request_json,'$.maximum.costMicros') FROM billing_reservations WHERE id=NEW.reservation_id
   ON CONFLICT(pool,period_key) DO UPDATE SET reserved=reserved+excluded.reserved;
  INSERT INTO arc_funding_pool_counters SELECT NEW.pool,substr(created_at,1,10),0,json_extract(request_json,'$.maximum.costMicros') FROM billing_reservations WHERE id=NEW.reservation_id
   ON CONFLICT(pool,period_key) DO UPDATE SET reserved=reserved+excluded.reserved;
 END;
CREATE TRIGGER arc_funding_pool_settle AFTER UPDATE OF status ON billing_reservations
 WHEN OLD.status NOT IN ('completed','failed') AND NEW.status IN ('completed','failed')
 BEGIN UPDATE arc_funding_pool_counters SET reserved=reserved-json_extract(NEW.request_json,'$.maximum.costMicros'),spent=spent+json_extract(NEW.settlement_json,'$.actual.costMicros')
  WHERE pool=(SELECT pool FROM arc_funding_allocations WHERE reservation_id=NEW.id) AND period_key IN ('all',substr(NEW.created_at,1,10)); END;
CREATE VIEW arc_funding_paid_users AS
 SELECT DISTINCT a.subject_id user_id FROM billing_plan_assignments a
 WHERE a.subject_type='user' AND a.plan_id IN ('arc-plus-v1','arc-pro-v1') AND a.revoked_at IS NULL
  AND a.created_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND a.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  AND EXISTS(SELECT 1 FROM arc_payment_receipts p LEFT JOIN arc_commercial_versions v ON v.id=p.commercial_version_id WHERE p.user_id=a.subject_id AND p.provider='stripe' AND p.currency='usd' AND p.state='paid' AND v.mode='live');
CREATE VIEW arc_funding_automatic_limits AS
 WITH funds AS (SELECT COALESCE(SUM(p.amount_cents),0)*10000 paid_total FROM arc_payment_receipts p LEFT JOIN arc_commercial_versions v ON v.id=p.commercial_version_id WHERE p.provider='stripe' AND p.currency='usd' AND p.state='paid' AND v.mode='live'),
 counts AS (SELECT (SELECT COUNT(*) FROM arc_funding_paid_users) paid_users,
  (SELECT COUNT(*) FROM arc_trials t WHERE t.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND t.started_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND t.user_id NOT IN (SELECT user_id FROM arc_funding_paid_users)) trial_users),
 trials AS (SELECT COALESCE(SUM(daily_allowance_micros),0) daily FROM arc_trials t WHERE t.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND t.started_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND t.user_id NOT IN (SELECT user_id FROM arc_funding_paid_users))
 SELECT p.total_micros sponsored_total,MIN(p.total_micros,MAX(p.daily_micros,trials.daily)) sponsored_daily,
  funds.paid_total,MIN(funds.paid_total,counts.paid_users*p.paid_user_daily_micros) paid_daily,counts.paid_users,counts.trial_users
 FROM arc_funding_policy p,funds,counts,trials WHERE p.id=1;

DROP TRIGGER arc_funding_reservation_guard;
CREATE TRIGGER arc_funding_reservation_guard BEFORE INSERT ON billing_reservations
 WHEN NEW.lane='arc_hosted' AND EXISTS(SELECT 1 FROM arc_funding_policy WHERE managed=1)
 AND NOT EXISTS(SELECT 1 FROM billing_reservations WHERE operation_key=NEW.operation_key)
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM arc_funding_policy p,arc_funding_automatic_limits limits
  WHERE p.id=1 AND p.enabled=1 AND p.started_at IS NOT NULL AND NEW.created_at>=p.started_at
   AND NEW.provider IN ('openai','anthropic','openrouter')
   AND (NEW.model_id='arc-auto' AND NEW.provider='openai' OR EXISTS(
    SELECT 1 FROM billing_plan_assignments a JOIN billing_plans b ON b.id=a.plan_id
    WHERE b.id IN ('arc-plus-v1','arc-pro-v1') AND b.active=1 AND b.lane='arc_hosted'
    AND a.revoked_at IS NULL AND a.expires_at>NEW.created_at AND a.subject_type='user' AND a.subject_id=NEW.user_id))
   AND (p.mode='manual' AND json_extract(NEW.request_json,'$.maximum.costMicros')+p.spent_micros+p.reserved_micros<=p.total_micros
    AND EXISTS(SELECT 1 FROM billing_budgets b WHERE b.scope_type='global' AND b.scope_id='platform'
     AND b.lane='arc_hosted' AND b.metric='cost_micros' AND b.period_key=substr(NEW.created_at,1,10)
     AND b.spent_units+b.reserved_units+json_extract(NEW.request_json,'$.maximum.costMicros')<=p.daily_micros)
    OR p.mode='automatic' AND json_extract(NEW.request_json,'$.creditRate.costMicrosPerUnit')=2 AND json_extract(NEW.request_json,'$.creditRate.unitsPerCredit')=1000 AND EXISTS(SELECT 1 FROM (
     SELECT CASE WHEN EXISTS(SELECT 1 FROM arc_funding_paid_users u WHERE u.user_id=NEW.user_id) THEN 'paid' ELSE 'sponsored' END pool
    ) choice WHERE
      json_extract(NEW.request_json,'$.maximum.costMicros')+COALESCE((SELECT spent+reserved FROM arc_funding_pool_counters s WHERE s.pool=choice.pool AND s.period_key='all'),0)
       <=CASE choice.pool WHEN 'paid' THEN limits.paid_total ELSE limits.sponsored_total END
      AND json_extract(NEW.request_json,'$.maximum.costMicros')+COALESCE((SELECT SUM(spent+reserved) FROM arc_funding_pool_usage s WHERE s.pool=choice.pool AND s.day=substr(NEW.created_at,1,10)),0)
       <=CASE choice.pool WHEN 'paid' THEN limits.paid_daily ELSE limits.sponsored_daily END))
 ) THEN RAISE(ABORT,'ARC_FUNDING_PAUSED_OR_LIMIT') END;
 END;
CREATE TRIGGER arc_funding_allocate AFTER INSERT ON billing_reservations
 WHEN NEW.lane='arc_hosted' AND EXISTS(SELECT 1 FROM arc_funding_policy WHERE managed=1 AND NEW.created_at>=started_at)
 BEGIN INSERT INTO arc_funding_allocations VALUES(NEW.id,CASE WHEN EXISTS(SELECT 1 FROM arc_funding_paid_users u WHERE u.user_id=NEW.user_id) THEN 'paid' ELSE 'sponsored' END); END;
