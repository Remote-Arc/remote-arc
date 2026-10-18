-- Invitation inbox for registered or future Remote Arc users.
-- Membership is granted only after the invited email signs in and accepts.
CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_org_invitation_inbox
  ON organization_invitations(email, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_pending_invite
  ON organization_invitations(organization_id, email) WHERE status='pending';
