ALTER TABLE website_submissions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE feedback_reward_versions(
 id TEXT PRIMARY KEY,revision INTEGER NOT NULL UNIQUE CHECK(revision>0),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),
 calls INTEGER NOT NULL CHECK(calls BETWEEN 1 AND 100000),valid_days INTEGER NOT NULL CHECK(valid_days BETWEEN 1 AND 365),
 per_user_limit INTEGER NOT NULL CHECK(per_user_limit BETWEEN 1 AND 10),total_calls_cap INTEGER NOT NULL CHECK(total_calls_cap BETWEEN 1 AND 10000000),
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,published_at TEXT NOT NULL
);
INSERT INTO feedback_reward_versions VALUES('seed:feedback-v1',1,0,500,30,1,50000,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE feedback_reward_policy(id INTEGER PRIMARY KEY CHECK(id=1),version_id TEXT NOT NULL REFERENCES feedback_reward_versions(id),revision INTEGER NOT NULL CHECK(revision>0));
INSERT INTO feedback_reward_policy VALUES(1,'seed:feedback-v1',1);
-- Keep accepted terms immutable while allowing account deletion to anonymize
-- the actor through ON DELETE SET NULL.
CREATE TRIGGER feedback_reward_version_immutable BEFORE UPDATE ON feedback_reward_versions
 WHEN NEW.id IS NOT OLD.id OR NEW.revision IS NOT OLD.revision OR NEW.enabled IS NOT OLD.enabled
  OR NEW.calls IS NOT OLD.calls OR NEW.valid_days IS NOT OLD.valid_days OR NEW.per_user_limit IS NOT OLD.per_user_limit
  OR NEW.total_calls_cap IS NOT OLD.total_calls_cap OR NEW.published_at IS NOT OLD.published_at
  OR (NEW.actor_id IS NOT OLD.actor_id AND NEW.actor_id IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'REWARD_VERSION_IMMUTABLE'); END;
CREATE TRIGGER feedback_reward_version_retained BEFORE DELETE ON feedback_reward_versions BEGIN SELECT RAISE(ABORT,'REWARD_VERSION_IMMUTABLE'); END;
CREATE TABLE feedback_reward_claims(
 id TEXT PRIMARY KEY,submission_id TEXT UNIQUE REFERENCES website_submissions(id) ON DELETE SET NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 version_id TEXT NOT NULL REFERENCES feedback_reward_versions(id),status TEXT NOT NULL CHECK(status IN('pending','granted','rejected')),
 created_at TEXT NOT NULL,reviewed_at TEXT,reviewer_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX feedback_reward_claims_status ON feedback_reward_claims(status,created_at);
CREATE TABLE connect_feedback_rewards(
 id TEXT PRIMARY KEY,claim_id TEXT NOT NULL UNIQUE REFERENCES feedback_reward_claims(id),user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 granted_calls INTEGER NOT NULL CHECK(granted_calls>0),spent_calls INTEGER NOT NULL DEFAULT 0 CHECK(spent_calls>=0 AND spent_calls<=granted_calls),
 starts_at TEXT NOT NULL,expires_at TEXT NOT NULL,granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL
);
CREATE INDEX connect_feedback_rewards_user ON connect_feedback_rewards(user_id,expires_at);
-- Account deletion removes private reward records without replenishing the
-- lifetime campaign allowance or concealing the amount already issued.
CREATE TABLE feedback_reward_campaign_usage(id INTEGER PRIMARY KEY CHECK(id=1),grants INTEGER NOT NULL DEFAULT 0,granted_calls INTEGER NOT NULL DEFAULT 0,spent_calls INTEGER NOT NULL DEFAULT 0);
INSERT INTO feedback_reward_campaign_usage VALUES(1,0,0,0);
CREATE TRIGGER feedback_reward_campaign_grant AFTER INSERT ON connect_feedback_rewards
 BEGIN UPDATE feedback_reward_campaign_usage SET grants=grants+1,granted_calls=granted_calls+NEW.granted_calls WHERE id=1; END;
CREATE TABLE connect_reward_consumptions(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,month_key TEXT NOT NULL,
 reward_id TEXT REFERENCES connect_feedback_rewards(id),base_limit INTEGER NOT NULL CHECK(base_limit>0),created_at TEXT NOT NULL
);
CREATE INDEX connect_reward_consumptions_month ON connect_reward_consumptions(user_id,month_key,reward_id);
CREATE TRIGGER connect_reward_consumption_guard BEFORE INSERT ON connect_reward_consumptions
 BEGIN
 SELECT CASE WHEN (NEW.reward_id IS NULL AND (COALESCE((SELECT tool_calls FROM user_monthly_usage WHERE user_id=NEW.user_id AND month_key=NEW.month_key),0)
  -(SELECT COUNT(*) FROM connect_reward_consumptions WHERE user_id=NEW.user_id AND month_key=NEW.month_key AND reward_id IS NOT NULL))>=NEW.base_limit)
  OR (NEW.reward_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM connect_feedback_rewards r WHERE r.id=NEW.reward_id AND r.user_id=NEW.user_id AND r.starts_at<=NEW.created_at AND r.expires_at>NEW.created_at AND r.spent_calls<r.granted_calls))
  THEN RAISE(ABORT,'CONNECT_REWARD_QUOTA_UNAVAILABLE') END;
 END;
CREATE TRIGGER connect_reward_consumption_apply AFTER INSERT ON connect_reward_consumptions
 BEGIN
  UPDATE connect_feedback_rewards SET spent_calls=spent_calls+1 WHERE id=NEW.reward_id;
  UPDATE feedback_reward_campaign_usage SET spent_calls=spent_calls+1 WHERE id=1 AND NEW.reward_id IS NOT NULL;
  INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(NEW.user_id,NEW.month_key,1,NEW.created_at)
   ON CONFLICT(user_id,month_key) DO UPDATE SET tool_calls=tool_calls+1,updated_at=excluded.updated_at;
 END;
