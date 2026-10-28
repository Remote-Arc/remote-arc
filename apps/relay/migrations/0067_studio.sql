-- Video project content and version labels are encrypted with the account vault.
CREATE TABLE studio_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL UNIQUE REFERENCES arc_chat_sessions(id),
  revision INTEGER NOT NULL DEFAULT 1,
  document_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX studio_projects_owner ON studio_projects(user_id, deleted_at, updated_at);
CREATE TABLE studio_versions (
  project_id TEXT NOT NULL REFERENCES studio_projects(id),
  revision INTEGER NOT NULL,
  document_ciphertext TEXT NOT NULL,
  label_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE TABLE studio_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name_ciphertext TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'ready')),
  created_at TEXT NOT NULL
);
CREATE INDEX studio_assets_owner ON studio_assets(user_id, project_id, status);
CREATE TABLE studio_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
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
CREATE INDEX studio_jobs_project ON studio_jobs(project_id, user_id, created_at);
