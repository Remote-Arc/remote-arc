-- A slow request may show one progress notice, separate from the final reply.
-- The final answer is posted as its own message so Slack notifies the user
-- (edits do not notify), and the notice is removed once the answer lands.
-- progress_ts: NULL = never posted, '' = post attempted with unknown outcome
-- (never retried, so a lost acknowledgement cannot duplicate it), else its ts.
ALTER TABLE slack_arc_events ADD COLUMN progress_ts TEXT;
ALTER TABLE slack_arc_events ADD COLUMN progress_kind TEXT;
