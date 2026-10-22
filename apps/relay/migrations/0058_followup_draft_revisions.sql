-- Saved drafts remain editable until dispatch. Revision checks prevent a stale
-- browser tab from replacing or sending a newer reviewed email.
ALTER TABLE user_followup_messages ADD COLUMN draft_revision INTEGER NOT NULL DEFAULT 1;
