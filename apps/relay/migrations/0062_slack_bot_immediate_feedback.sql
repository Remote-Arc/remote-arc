-- Preserve the initiating Slack message timestamp for optional AI status updates.
-- thread_ts continues to describe conversation threading only.
ALTER TABLE slack_arc_events ADD COLUMN source_ts TEXT;
