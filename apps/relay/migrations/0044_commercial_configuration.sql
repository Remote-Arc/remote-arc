-- D1 is the commercial source of truth. Published versions are immutable;
-- public heads can move while subscriptions and receipts retain their version.
CREATE TABLE arc_commercial_versions (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('plan','topup','trial')),
 mode TEXT NOT NULL CHECK(mode IN ('live','test')),
 config_json TEXT NOT NULL CHECK(json_valid(config_json)),
 stripe_price_id TEXT UNIQUE,
 base_revision INTEGER NOT NULL,
 created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, published_at TEXT
);
CREATE TABLE arc_commercial_heads (
 product_id TEXT NOT NULL, mode TEXT NOT NULL,
 version_id TEXT NOT NULL REFERENCES arc_commercial_versions(id),
 revision INTEGER NOT NULL CHECK(revision>0),
 PRIMARY KEY(product_id,mode)
);
CREATE TABLE arc_commercial_audit (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL, subject_id TEXT NOT NULL, mode TEXT NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)), created_at TEXT NOT NULL
);
WITH defaults(product_id,kind,config) AS (VALUES
 ('free','plan','{"id":"free","label":"Free","monthlyPriceCents":0,"monthlyCredits":0,"connectToolCalls":500,"deviceLimit":2,"connectionLimit":5,"allHostedModels":false,"concurrentRuns":1,"routines":3,"maxSteps":8,"maxTokens":24000,"maxSeconds":180}'),
 ('arc-plus-v1','plan','{"id":"arc-plus-v1","label":"Plus","monthlyPriceCents":3900,"monthlyCredits":1500,"connectToolCalls":null,"deviceLimit":5,"connectionLimit":50,"allHostedModels":true,"concurrentRuns":2,"routines":20,"maxSteps":16,"maxTokens":48000,"maxSeconds":600}'),
 ('arc-pro-v1','plan','{"id":"arc-pro-v1","label":"Pro","monthlyPriceCents":7900,"monthlyCredits":5000,"connectToolCalls":null,"deviceLimit":20,"connectionLimit":200,"allHostedModels":true,"concurrentRuns":5,"routines":100,"maxSteps":32,"maxTokens":96000,"maxSeconds":1800}'),
 ('arc-topup-500-v1','topup','{"id":"arc-topup-500-v1","credits":500,"priceCents":1000}'),
 ('arc-trial-v1','trial','{"id":"arc-trial-v1","days":14,"credits":200}')
), modes(mode) AS (VALUES('live'),('test'))
INSERT INTO arc_commercial_versions(id,product_id,kind,mode,config_json,base_revision,created_at,published_at)
SELECT 'seed:'||mode||':'||product_id,product_id,kind,mode,config,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM defaults CROSS JOIN modes;
INSERT INTO arc_commercial_heads SELECT product_id,mode,id,1 FROM arc_commercial_versions;
CREATE TRIGGER arc_commercial_immutable BEFORE UPDATE OF product_id,kind,mode,config_json,stripe_price_id,published_at,base_revision,created_at ON arc_commercial_versions
WHEN OLD.published_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'published_commercial_version_is_immutable'); END;
CREATE TRIGGER arc_commercial_retain_history BEFORE DELETE ON arc_commercial_versions
WHEN OLD.published_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'published_commercial_version_is_immutable'); END;
ALTER TABLE billing_plan_assignments ADD COLUMN commercial_version_id TEXT REFERENCES arc_commercial_versions(id);
ALTER TABLE arc_billing_subscriptions ADD COLUMN commercial_version_id TEXT REFERENCES arc_commercial_versions(id);
ALTER TABLE arc_payment_receipts ADD COLUMN commercial_version_id TEXT REFERENCES arc_commercial_versions(id);
ALTER TABLE arc_payment_receipts ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents>=0);
ALTER TABLE arc_billing_checkouts ADD COLUMN commercial_version_id TEXT REFERENCES arc_commercial_versions(id);
ALTER TABLE arc_billing_checkouts ADD COLUMN promotion_id TEXT;
ALTER TABLE arc_trials ADD COLUMN commercial_version_id TEXT REFERENCES arc_commercial_versions(id);

CREATE TABLE arc_billing_promotions (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('live','test')),
 code TEXT NOT NULL, product_id TEXT NOT NULL CHECK(product_id IN ('arc-plus-v1','arc-pro-v1')),
 percent_off INTEGER NOT NULL CHECK(percent_off BETWEEN 1 AND 90),
 target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, max_redemptions INTEGER NOT NULL CHECK(max_redemptions>0),
 coupon_id TEXT UNIQUE, promotion_code_id TEXT UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('draft','active','disabled')),
 created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, published_at TEXT, UNIQUE(mode,code)
);
CREATE TABLE arc_promotion_assignments (
 promotion_id TEXT NOT NULL REFERENCES arc_billing_promotions(id),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL, created_at TEXT NOT NULL, applied_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','applied','unknown')),
 PRIMARY KEY(promotion_id,user_id)
);
CREATE TABLE arc_promotion_redemptions (
 promotion_id TEXT NOT NULL REFERENCES arc_billing_promotions(id),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 receipt_id TEXT NOT NULL UNIQUE REFERENCES arc_payment_receipts(id),
 discount_cents INTEGER NOT NULL CHECK(discount_cents>0), created_at TEXT NOT NULL,
 PRIMARY KEY(promotion_id,user_id)
);
CREATE TABLE arc_payment_issues (
 invoice_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 amount_due_cents INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','resolved')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
