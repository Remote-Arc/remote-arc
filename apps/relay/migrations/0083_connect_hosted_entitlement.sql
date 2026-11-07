-- Hosted Arc entitlement for Connect Unlimited versions that include Arc Credits.
-- Connect Unlimited's own plan row stays on the 'connect' lane. A paid invoice on
-- a version with Credits and hosted models adds a second assignment to this row,
-- so hosted Arc follows that paid period and its refund. Connect-only versions
-- never reference it. Adds one row; no existing plan, version or assignment changes.
INSERT OR IGNORE INTO billing_plans(id,lane,features_json,created_at) VALUES
 ('connect-unlimited-hosted-v1','arc_hosted','["apps","hosted_inference","paid_models"]',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
