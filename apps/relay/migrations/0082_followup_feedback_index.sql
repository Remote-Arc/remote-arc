-- Additive index: the follow-up list counts feedback that answers a follow-up
-- email by its source ('followup:<message id>'), which had no index and scanned
-- every submission. Existing rows and readers are unaffected.
CREATE INDEX IF NOT EXISTS website_submissions_source ON website_submissions(source);
