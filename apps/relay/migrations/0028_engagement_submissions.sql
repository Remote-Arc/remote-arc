-- Follow-on to 0027 organization foundation (PR #172). Public interest and
-- feedback never have permission to read sessions, devices or private tasks.
CREATE TABLE IF NOT EXISTS website_submissions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('early_access','feedback')),
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'website',
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','contacted','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_submissions_early_email
  ON website_submissions(lower(email)) WHERE category='early_access';
CREATE INDEX IF NOT EXISTS idx_website_submissions_newest
  ON website_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_submissions_status
  ON website_submissions(status, created_at DESC);
