-- Freeze the reviewed branded HTML and text for each follow-up draft.
ALTER TABLE user_followup_messages ADD COLUMN design_json TEXT;
ALTER TABLE user_followup_messages ADD COLUMN html_body TEXT;
ALTER TABLE user_followup_messages ADD COLUMN text_body TEXT;
