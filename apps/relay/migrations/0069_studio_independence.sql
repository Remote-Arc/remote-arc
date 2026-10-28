-- Generic host billing authority; Studio projects no longer require chat sessions.
CREATE TABLE billing_workloads (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 organization_id TEXT NOT NULL REFERENCES organizations(id), product TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','closed')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX billing_workloads_owner ON billing_workloads(user_id,organization_id,status);
INSERT INTO billing_workloads(id,user_id,organization_id,product,status,created_at,updated_at)
 SELECT id,user_id,'personal:'||user_id,'studio',CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'closed' END,created_at,updated_at FROM studio_projects;
-- Retire legacy internal authority records. Existing ordinary chats are untouched.
UPDATE arc_chat_sessions SET deleted_at=COALESCE(deleted_at,datetime('now')) WHERE workspace='studio';
-- Video project content and version labels are encrypted with the account vault.
CREATE TABLE studio_projects_independent (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  document_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE studio_versions_independent (
  project_id TEXT NOT NULL REFERENCES studio_projects_independent(id),
  revision INTEGER NOT NULL,
  document_ciphertext TEXT NOT NULL,
  label_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE TABLE studio_assets_independent (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects_independent(id),
  user_id TEXT NOT NULL,
  name_ciphertext TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'ready')),
  created_at TEXT NOT NULL
);
CREATE TABLE studio_jobs_independent (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects_independent(id),
  user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','unknown','conflict','cancelled')),
  input_ciphertext TEXT NOT NULL,
  result_ciphertext TEXT,
  skill_versions_json TEXT NOT NULL DEFAULT '[]',
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, request_id)
);
INSERT INTO studio_projects_independent(id,user_id,revision,document_ciphertext,created_at,updated_at,deleted_at) SELECT id,user_id,revision,document_ciphertext,created_at,updated_at,deleted_at FROM studio_projects;
INSERT INTO studio_versions_independent(project_id,revision,document_ciphertext,label_ciphertext,created_at) SELECT project_id,revision,document_ciphertext,label_ciphertext,created_at FROM studio_versions;
INSERT INTO studio_assets_independent(id,project_id,user_id,name_ciphertext,content_type,byte_size,storage_key,status,created_at) SELECT id,project_id,user_id,name_ciphertext,content_type,byte_size,storage_key,status,created_at FROM studio_assets;
INSERT INTO studio_jobs_independent(id,project_id,user_id,request_id,input_hash,base_revision,model_id,status,input_ciphertext,result_ciphertext,skill_versions_json,error_code,created_at,updated_at) SELECT id,project_id,user_id,request_id,input_hash,base_revision,model_id,status,input_ciphertext,result_ciphertext,skill_versions_json,error_code,created_at,updated_at FROM studio_jobs;
DROP TABLE studio_jobs;
DROP TABLE studio_assets;
DROP TABLE studio_versions;
DROP TABLE studio_projects;
ALTER TABLE studio_projects_independent RENAME TO studio_projects;
ALTER TABLE studio_versions_independent RENAME TO studio_versions;
ALTER TABLE studio_assets_independent RENAME TO studio_assets;
ALTER TABLE studio_jobs_independent RENAME TO studio_jobs;

CREATE INDEX studio_projects_owner ON studio_projects(user_id, deleted_at, updated_at);
CREATE INDEX studio_assets_owner ON studio_assets(user_id, project_id, status);
CREATE INDEX studio_jobs_project ON studio_jobs(project_id, user_id, created_at);
