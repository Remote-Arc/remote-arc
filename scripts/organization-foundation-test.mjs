import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");
const migration = (name) => readFileSync(
  new URL(`../apps/relay/migrations/${name}`, import.meta.url), "utf8",
);
try {
  db.exec(migration("0001_identity.sql"));
  db.exec(migration("0002_product.sql"));
  db.exec(migration("0010_automations.sql"));
  const timestamp = "2026-10-15T00:00:00.000Z";
  for (const [id, email] of [["alpha", "alpha@example.test"], ["beta", "beta@example.test"]]) {
    db.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)")
      .run(id, id, email, timestamp);
  }
  db.prepare("INSERT INTO devices (id, user_id, name, platform, credential_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("device-alpha", "alpha", "Mac", "darwin", "hash-alpha", timestamp);
  db.prepare("INSERT INTO automations (id, user_id, name, kind, action_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("task-alpha", "alpha", "Legacy task", "long_task", "{}", timestamp, timestamp);
  const before = db.prepare("SELECT id, user_id FROM devices").all();
  const beforeTask = db.prepare("SELECT id, user_id FROM automations").all();

  db.exec(migration("0027_organization_foundation.sql"));
  db.exec(migration("0027_organization_foundation.sql"));
  assert.equal(db.prepare("SELECT count(*) AS n FROM organizations").get().n, 2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM organization_members").get().n, 2);
  assert.deepEqual(db.prepare("SELECT id, user_id FROM devices").all(), before);
  assert.deepEqual(db.prepare("SELECT id, user_id FROM automations").all(), beforeTask);
  assert.deepEqual(
    db.prepare("SELECT organization_id, user_id, role FROM organization_members ORDER BY user_id").all().map((row) => ({ ...row })),
    [
      { organization_id: "personal:alpha", user_id: "alpha", role: "owner" },
      { organization_id: "personal:beta", user_id: "beta", role: "owner" },
    ],
  );

  // Login flows can keep inserting users without knowing about organizations.
  db.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)")
    .run("gamma", "gamma", "gamma@example.test", timestamp);
  assert.equal(db.prepare("SELECT count(*) AS n FROM organization_members WHERE user_id = 'gamma' AND role = 'owner'").get().n, 1);

  // Team membership is NOT authorization to use someone's existing private device.
  db.prepare("INSERT INTO organizations (id, name, kind, created_at) VALUES (?, ?, ?, ?)")
    .run("team:example", "Example team", "team", timestamp);
  db.prepare("INSERT INTO organization_members (organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)")
    .run("team:example", "beta", "member", timestamp);
  assert.equal(db.prepare("SELECT user_id FROM devices WHERE id = 'device-alpha'").get().user_id, "alpha");

  // Existing account deletion retains cascading ownership cleanup.
  db.prepare("DELETE FROM users WHERE id = 'alpha'").run();
  assert.equal(db.prepare("SELECT count(*) AS n FROM organizations WHERE personal_owner_user_id = 'alpha'").get().n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM devices WHERE id = 'device-alpha'").get().n, 0);

  console.log("PASS: additive org schema, legacy ownership, backfill, new signup, isolation, deletion");
} finally {
  db.close();
}
