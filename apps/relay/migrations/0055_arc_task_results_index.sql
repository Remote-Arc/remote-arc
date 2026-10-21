-- Task cards request the most recent occurrence without scanning an owner's chat history.
CREATE INDEX IF NOT EXISTS arc_chat_runs_task_recent
ON arc_chat_runs(user_id,automation_id,created_at DESC,id DESC)
WHERE automation_id IS NOT NULL;
