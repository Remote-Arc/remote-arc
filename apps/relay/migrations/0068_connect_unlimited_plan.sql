-- Connect Unlimited: a paid, Connect-only plan. It lives on the 'connect'
-- billing lane, so it can never satisfy an 'arc_hosted' entitlement check.
-- Existing plans, versions and assignments are untouched.
INSERT INTO billing_plans(id,lane,features_json,created_at) VALUES
 ('connect-unlimited-v1','connect','["unlimited_connect_calls","unlimited_devices"]',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

WITH modes(mode) AS (VALUES('live'),('test'))
INSERT INTO arc_commercial_versions(id,product_id,kind,mode,config_json,base_revision,created_at,published_at)
SELECT 'seed:'||mode||':connect-unlimited-v1','connect-unlimited-v1','plan',mode,
 '{"id":"connect-unlimited-v1","label":"Connect Unlimited","monthlyPriceCents":1900,"monthlyCredits":0,"connectToolCalls":null,"deviceLimit":null,"connectionLimit":50,"allHostedModels":false,"concurrentRuns":1,"routines":3,"maxSteps":8,"maxTokens":24000,"maxSeconds":180}',
 0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM modes;

INSERT INTO arc_commercial_heads(product_id,mode,version_id,revision)
SELECT product_id,mode,id,1 FROM arc_commercial_versions WHERE product_id='connect-unlimited-v1';

INSERT INTO arc_commercial_audit(id,actor_id,action,subject_id,mode,details_json,created_at)
SELECT 'migration:0068:'||mode,NULL,'published',id,mode,
 json_object('revision',1,'reason','Launch Connect Unlimited (US$19/month, no included hosted Arc inference)'),
 strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM arc_commercial_versions WHERE product_id='connect-unlimited-v1';
