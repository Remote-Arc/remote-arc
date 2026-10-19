ALTER TABLE arc_chat_sessions ADD COLUMN content_purged_at TEXT;
CREATE INDEX arc_chat_deleted_cleanup ON arc_chat_sessions(deleted_at,id) WHERE deleted_at IS NOT NULL AND content_purged_at IS NULL;
