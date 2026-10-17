-- Registry-owned provider validation permits additive connectors without a schema edit per App.
-- Rebuild the dependent call table as well. Dropping a referenced parent alone
-- leaves deferred violation counters even after the same IDs are reinserted.
CREATE TABLE app_calls_backup AS SELECT * FROM app_calls;
DROP TABLE app_calls;
CREATE TABLE app_connections_next (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, account_id TEXT NOT NULL, account_label TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','reauthorization_required','disconnected')),
 permissions_json TEXT NOT NULL, scopes_json TEXT NOT NULL, token_ciphertext TEXT,
 expires_at TEXT, generation INTEGER NOT NULL DEFAULT 1,
 refresh_lease TEXT, refresh_lease_until TEXT, last_error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 connection_metadata_json TEXT NOT NULL DEFAULT '{}',
 daily_call_limit INTEGER NOT NULL DEFAULT 100 CHECK(daily_call_limit BETWEEN 1 AND 10000),
 UNIQUE(user_id,provider,account_id)
);
INSERT INTO app_connections_next(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,expires_at,generation,refresh_lease,refresh_lease_until,last_error,created_at,updated_at)
 SELECT id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,expires_at,generation,refresh_lease,refresh_lease_until,last_error,created_at,updated_at FROM app_connections;
DROP TABLE app_connections;
ALTER TABLE app_connections_next RENAME TO app_connections;
CREATE INDEX idx_app_connections_user ON app_connections(user_id,status);
CREATE TABLE app_calls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES app_connections(id),
  connection_generation INTEGER NOT NULL,
  operation TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('read','write')),
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  arguments_ciphertext TEXT NOT NULL,
  result_ciphertext TEXT,
  review_ciphertext TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending_approval','approved','running','succeeded','failed','unknown','rejected','cancelled')),
  error_code TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,request_id)
);
CREATE INDEX idx_app_calls_user_status ON app_calls(user_id,status,created_at);

INSERT INTO app_calls SELECT * FROM app_calls_backup;
DROP TABLE app_calls_backup;
CREATE TABLE app_dispatch_usage (
 connection_id TEXT NOT NULL, provider TEXT NOT NULL, day TEXT NOT NULL,
 dispatches INTEGER NOT NULL CHECK(dispatches >= 0),
 PRIMARY KEY(connection_id,day)
);
CREATE INDEX idx_app_dispatch_provider_day ON app_dispatch_usage(provider,day);
