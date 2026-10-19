-- Preserve existing provider grants while extending the same authorization boundary.
CREATE TABLE billing_model_grants_next (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES automations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('openai','anthropic','openrouter')),
  max_cost_micros INTEGER NOT NULL CHECK(max_cost_micros > 0),
  expires_at TEXT NOT NULL, revoked_at TEXT,
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
INSERT INTO billing_model_grants_next SELECT * FROM billing_model_grants;
-- Paid Arc plans include all configured providers. Manual grants keep their original scope.
INSERT INTO billing_model_grants_next
SELECT substr(id,1,length(id)-6)||'openrouter',user_id,organization_id,task_id,'openrouter',
  max_cost_micros,expires_at,revoked_at,granted_by_user_id,created_at
FROM billing_model_grants WHERE provider='openai' AND id LIKE 'stripe:%:openai';
DROP TABLE billing_model_grants;
ALTER TABLE billing_model_grants_next RENAME TO billing_model_grants;
CREATE INDEX billing_model_grants_actor ON billing_model_grants(user_id,organization_id,provider);
