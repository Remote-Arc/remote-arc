-- Keep Studio's account-owned billing authority outside ordinary chat history.
ALTER TABLE arc_chat_sessions ADD COLUMN workspace TEXT NOT NULL DEFAULT 'chat'
  CHECK(workspace IN ('chat', 'studio'));
UPDATE arc_chat_sessions SET workspace='studio'
WHERE EXISTS(SELECT 1 FROM studio_projects p WHERE p.session_id=arc_chat_sessions.id);
CREATE INDEX arc_sessions_workspace ON arc_chat_sessions(user_id, workspace, deleted_at, updated_at);
