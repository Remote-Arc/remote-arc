-- Additive covering indexes for the exact successful-use evidence predicates.
-- Existing readers/writers and all historical rows remain valid.
CREATE INDEX IF NOT EXISTS audit_success_user_time
ON audit_events(user_id,created_at)
WHERE event_type='mcp.tool_call' AND success=1 AND device_id IS NOT NULL
  AND (outcome IS NULL OR outcome='allowed');

CREATE INDEX IF NOT EXISTS app_calls_success_user_time
ON app_calls(user_id,updated_at) WHERE status='succeeded';

CREATE INDEX IF NOT EXISTS arc_runs_success_user_time
ON arc_chat_runs(user_id,updated_at) WHERE status='succeeded';

CREATE INDEX IF NOT EXISTS product_success_user_time
ON product_events(user_id,occurred_at)
WHERE source='server' AND outcome='succeeded'
  AND name IN ('device.tool.completed','app.call.succeeded','task.run.succeeded');
