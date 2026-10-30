-- Reviewer fixtures are test traffic, not acquired or retained real users.
UPDATE business_cohort_users SET is_demo = 1
WHERE user_id IN ('reviewer-openai-v1', 'reviewer-anthropic-v1');

DROP TRIGGER business_user_registered;
CREATE TRIGGER business_user_registered AFTER INSERT ON users BEGIN
 INSERT INTO business_cohort_users(id,user_id,registered_at,is_demo)
 VALUES(lower(hex(randomblob(16))),NEW.id,NEW.created_at,
  CASE WHEN NEW.id IN ('reviewer-openai-v1','reviewer-anthropic-v1') THEN 1 ELSE 0 END);
END;
