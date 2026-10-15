-- Phase 0: additive tenancy foundation. No existing device, token, or task ownership changes.
-- Personal organizations have deterministic IDs and are private to their existing user.
-- A team organization MUST NOT inherit a user's devices or OAuth credentials implicitly.
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'team')),
  personal_owner_user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  CHECK (
    (kind = 'personal' AND personal_owner_user_id IS NOT NULL) OR
    (kind = 'team' AND personal_owner_user_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_organizations_owner
  ON organizations(personal_owner_user_id);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON organization_members(user_id, organization_id);

-- Existing users are backfilled without touching original user_id foreign keys.
INSERT OR IGNORE INTO organizations
  (id, name, kind, personal_owner_user_id, created_at)
SELECT 'personal:' || id, 'Personal workspace', 'personal', id, created_at
FROM users;

INSERT OR IGNORE INTO organization_members
  (organization_id, user_id, role, status, created_at)
SELECT 'personal:' || id, id, 'owner', 'active', created_at
FROM users;

-- Automatically give future signups a private org while old auth endpoints remain unchanged.
CREATE TRIGGER IF NOT EXISTS trg_users_personal_organization
AFTER INSERT ON users
BEGIN
  INSERT INTO organizations (id, name, kind, personal_owner_user_id, created_at)
  VALUES ('personal:' || NEW.id, 'Personal workspace', 'personal', NEW.id, NEW.created_at);
  INSERT INTO organization_members (organization_id, user_id, role, status, created_at)
  VALUES ('personal:' || NEW.id, NEW.id, 'owner', 'active', NEW.created_at);
END;
