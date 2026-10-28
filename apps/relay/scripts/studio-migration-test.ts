import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
const migrations = new URL("../migrations/", import.meta.url);
try {
  for (const name of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql") && name < "0069")
    .sort())
    db.exec(readFileSync(new URL(name, migrations), "utf8"));
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users(id,google_sub,email,name,created_at,role,plan) VALUES(?,?,?,?,?,'user','free')",
  ).run(
    "legacy-owner",
    "legacy-owner",
    "legacy@localhost",
    "Legacy Owner",
    now,
  );
  db.prepare(
    "INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at,workspace) VALUES('legacy-authority','legacy-owner','personal:legacy-owner','encrypted-title','auto',?1,?1,'studio')",
  ).run(now);
  db.prepare(
    "INSERT INTO studio_projects(id,user_id,session_id,document_ciphertext,revision,created_at,updated_at) VALUES('legacy-project','legacy-owner','legacy-authority','encrypted-document',7,?1,?1)",
  ).run(now);
  db.prepare(
    "INSERT INTO studio_versions(project_id,revision,document_ciphertext,label_ciphertext,created_at) VALUES('legacy-project',7,'encrypted-document','encrypted-label',?1)",
  ).run(now);
  db.prepare(
    "INSERT INTO studio_assets(id,project_id,user_id,name_ciphertext,content_type,byte_size,storage_key,status,created_at) VALUES('legacy-asset','legacy-project','legacy-owner','encrypted-name','image/png',1234,'studio/legacy-owner/legacy-project/legacy-asset','ready',?1)",
  ).run(now);
  db.prepare(
    "INSERT INTO studio_jobs(id,project_id,user_id,request_id,input_hash,base_revision,model_id,status,input_ciphertext,result_ciphertext,skill_versions_json,created_at,updated_at) VALUES('legacy-job','legacy-project','legacy-owner','legacy-request','hash',6,'auto','completed','encrypted-input','encrypted-result','[{\"id\":\"guide\",\"version\":\"hash\"}]',?1,?1)",
  ).run(now);
  const tables = [
    "studio_projects",
    "studio_versions",
    "studio_assets",
    "studio_jobs",
  ];
  const before = Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) => {
          const { session_id, ...portable } = row;
          return portable;
        }),
    ]),
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(
      readFileSync(new URL("0069_studio_independence.sql", migrations), "utf8"),
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const table of tables) {
    assert.deepEqual(
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .map((row) => ({ ...row })),
      before[table],
      `${table}: encrypted contents, stable IDs and revisions preserved`,
    );
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    assert(
      foreignKeys.every((key) => tables.includes(key.table as string)),
      "Portable Studio tables have no external foreign keys",
    );
  }
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert(
    db
      .prepare(
        "SELECT deleted_at FROM arc_chat_sessions WHERE id='legacy-authority'",
      )
      .get()?.deleted_at,
  );
  assert.equal(
    db
      .prepare("SELECT status FROM billing_workloads WHERE id='legacy-project'")
      .get()?.status,
    "active",
  );
  assert(
    !db
      .prepare("PRAGMA table_info(studio_projects)")
      .all()
      .some((column) => column.name === "session_id"),
  );
  console.log(
    "PASS Studio independence migration: existing ciphertext, snapshots, media keys, job receipts and revisions preserved; external FKs removed; legacy authority retired; workload registered in one transaction.",
  );
} finally {
  db.close();
}
