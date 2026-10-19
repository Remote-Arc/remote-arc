CREATE TABLE arc_funding_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 started_at TEXT,
 total_micros INTEGER NOT NULL DEFAULT 3000000 CHECK(total_micros BETWEEN 1 AND 10000000000),
 daily_micros INTEGER NOT NULL DEFAULT 500000 CHECK(daily_micros BETWEEN 1 AND 1000000000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 spent_micros INTEGER NOT NULL DEFAULT 0 CHECK(spent_micros>=0),
 reserved_micros INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micros>=0),
 updated_at TEXT NOT NULL
);
INSERT INTO arc_funding_policy(id,updated_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE arc_funding_audit (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
 details_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX billing_reservations_funding_cost ON billing_reservations(lane,created_at);
-- Pause/resume and redeployment must never reset the cumulative spending window.
CREATE TRIGGER arc_funding_keep_window BEFORE UPDATE ON arc_funding_policy
 WHEN OLD.started_at IS NOT NULL AND (NEW.started_at IS NOT OLD.started_at OR NEW.managed!=1)
 BEGIN SELECT RAISE(ABORT,'ARC_FUNDING_WINDOW_IMMUTABLE'); END;
CREATE TRIGGER arc_funding_keep_policy BEFORE DELETE ON arc_funding_policy
 BEGIN SELECT RAISE(ABORT,'ARC_FUNDING_POLICY_REQUIRED'); END;
-- This executes inside the same write transaction as every inference reservation.
-- Unknown requests retain their entire maximum; settlement releases only confirmed unused cost.
CREATE TRIGGER arc_funding_reservation_guard BEFORE INSERT ON billing_reservations
 WHEN NEW.lane='arc_hosted' AND EXISTS(SELECT 1 FROM arc_funding_policy WHERE managed=1)
 AND NOT EXISTS(SELECT 1 FROM billing_reservations WHERE operation_key=NEW.operation_key)
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM arc_funding_policy p
  WHERE p.id=1 AND p.enabled=1 AND p.started_at IS NOT NULL AND NEW.created_at>=p.started_at
   AND NEW.provider IN ('openai','anthropic','openrouter')
   AND (NEW.model_id='arc-auto' AND NEW.provider='openai' OR EXISTS(
    SELECT 1 FROM billing_plan_assignments a JOIN billing_plans b ON b.id=a.plan_id
    WHERE b.id IN ('arc-plus-v1','arc-pro-v1') AND b.active=1 AND b.lane='arc_hosted'
    AND a.revoked_at IS NULL AND a.expires_at>NEW.created_at
    AND a.subject_type='user' AND a.subject_id=NEW.user_id))
   AND json_extract(NEW.request_json,'$.maximum.costMicros')+p.spent_micros+p.reserved_micros<=p.total_micros
   AND EXISTS(SELECT 1 FROM billing_budgets b WHERE b.scope_type='global' AND b.scope_id='platform'
    AND b.lane='arc_hosted' AND b.metric='cost_micros' AND b.period_key=substr(NEW.created_at,1,10)
    AND b.spent_units+b.reserved_units+json_extract(NEW.request_json,'$.maximum.costMicros')<=p.daily_micros)
 ) THEN RAISE(ABORT,'ARC_FUNDING_PAUSED_OR_LIMIT') END;
 END;
CREATE TRIGGER arc_funding_reserve AFTER INSERT ON billing_reservations
 WHEN NEW.lane='arc_hosted'
 BEGIN UPDATE arc_funding_policy SET reserved_micros=reserved_micros+json_extract(NEW.request_json,'$.maximum.costMicros')
 WHERE id=1 AND managed=1 AND NEW.created_at>=started_at; END;
CREATE TRIGGER arc_funding_settle AFTER UPDATE OF status ON billing_reservations
 WHEN NEW.lane='arc_hosted' AND OLD.status NOT IN ('completed','failed') AND NEW.status IN ('completed','failed')
 BEGIN UPDATE arc_funding_policy SET reserved_micros=reserved_micros-json_extract(NEW.request_json,'$.maximum.costMicros'),spent_micros=spent_micros+json_extract(NEW.settlement_json,'$.actual.costMicros')
 WHERE id=1 AND managed=1 AND NEW.created_at>=started_at; END;
CREATE TRIGGER arc_funding_retain_ledger BEFORE DELETE ON billing_reservations
 WHEN OLD.lane='arc_hosted' AND EXISTS(SELECT 1 FROM arc_funding_policy WHERE managed=1 AND OLD.created_at>=started_at)
 BEGIN SELECT RAISE(ABORT,'ARC_FUNDING_LEDGER_RETAINED'); END;
