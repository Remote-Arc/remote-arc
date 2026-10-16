-- Public interest and feedback are separate from users, sessions and financial records.
-- 0027 is reserved by Phase 0 organization foundation; no FK to organization.
CREATE TABLE IF NOT EXISTS arc_interest_leads (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('early_access','feedback')),
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  message TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL DEFAULT 'arc',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','contacted','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arc_interest_created ON arc_interest_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arc_interest_status_created ON arc_interest_leads(status,created_at DESC);
