import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
  writeSync,
  readSync,
  statSync,
  truncateSync,
  createReadStream,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import {
  backupKey,
  encryptBackup,
  decryptBackup,
  verifySqlBackup,
} from "./d1-production-backup.mjs";
import { ensureAppsVault } from "./ensure-apps-vault.mjs";
const directory = mkdtempSync(path.join(tmpdir(), "ra-release-ops-")),
  key = randomBytes(32),
  sql = path.join(directory, "fixture.sql"),
  encrypted = path.join(directory, "encrypted"),
  restored = path.join(directory, "restored.sql");
try {
  for (const value of [
    "",
    undefined,
    "not-base64",
    Buffer.alloc(31).toString("base64"),
    Buffer.alloc(33).toString("base64"),
  ])
    assert.throws(() => backupKey(value));
  assert.deepEqual(backupKey(key.toString("base64")), key);
  const fixture =
    "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO d1_migrations VALUES(1,'0001_initial.sql'); CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); INSERT INTO users VALUES('user-one','private@example.invalid');";
  writeFileSync(sql, fixture);
  verifySqlBackup(sql, ["0001_initial.sql"]);
  assert.throws(() => verifySqlBackup(sql, ["wrong.sql"]), /verification/);
  await encryptBackup(sql, encrypted, key);
  assert(
    !readFileSync(path.join(encrypted, "production.sql.enc")).includes(
      Buffer.from("private@example.invalid"),
    ),
  );
  await decryptBackup(encrypted, key, restored);
  assert.equal(readFileSync(restored, "utf8"), fixture);
  verifySqlBackup(restored, ["0001_initial.sql"]);
  await assert.rejects(() => decryptBackup(encrypted, key, restored));
  assert.equal(
    readFileSync(restored, "utf8"),
    fixture,
    "never overwrite an existing operator file",
  );
  await assert.rejects(() =>
    decryptBackup(encrypted, randomBytes(32), path.join(directory, "wrong-key.sql")),
  );
  const ciphertext = readFileSync(path.join(encrypted, "production.sql.enc"));
  ciphertext[0] ^= 1;
  writeFileSync(path.join(encrypted, "production.sql.enc"), ciphertext);
  await assert.rejects(() => decryptBackup(encrypted, key, path.join(directory, "tampered.sql")));
  const manifestPath = path.join(encrypted, "manifest.json"),
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, encryptedFile: "../outside.sql" }));
  await assert.rejects(
    () => decryptBackup(encrypted, key, path.join(directory, "path.sql")),
    /manifest/,
  );
  writeFileSync(sql, "");
  await assert.rejects(() => encryptBackup(sql, path.join(directory, "empty"), key), /size/);
  // A real SQL export larger than the old 256 MiB ceiling must remain recoverable.
  const largeSql = path.join(directory, "large.sql"),
    largeEncrypted = path.join(directory, "large-encrypted"),
    largeRestored = path.join(directory, "large-restored.sql");
  const comment = Buffer.from("--" + "x".repeat(1024 * 1024 - 3) + "\n"),
    handle = openSync(largeSql, "wx", 0o600);
  try {
    for (let index = 0; index < 257; index++) writeSync(handle, comment);
    writeSync(handle, fixture);
  } finally {
    closeSync(handle);
  }
  assert(statSync(largeSql).size > 256 * 1024 * 1024);
  const digest = async (file) => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest("hex");
  };
  const originalHash = await digest(largeSql);
  verifySqlBackup(largeSql, ["0001_initial.sql"]);
  const largeManifest = await encryptBackup(largeSql, largeEncrypted, key);
  assert.equal(largeManifest.sha256, originalHash);
  assert.equal(
    statSync(path.join(largeEncrypted, "production.sql.enc")).size,
    statSync(largeSql).size,
    "streamed AES-GCM preserves export size",
  );
  await decryptBackup(largeEncrypted, key, largeRestored);
  assert.equal(
    await digest(largeRestored),
    originalHash,
    "every SQL byte survives the large-file round-trip",
  );
  verifySqlBackup(largeRestored, ["0001_initial.sql"]);
  const largeCipher = path.join(largeEncrypted, "production.sql.enc"),
    cipherHandle = openSync(largeCipher, "r+");
  try {
    const position = statSync(largeCipher).size - 1,
      byte = Buffer.alloc(1);
    readSync(cipherHandle, byte, 0, 1, position);
    byte[0] ^= 1;
    writeSync(cipherHandle, byte, 0, 1, position);
  } finally {
    closeSync(cipherHandle);
  }
  const failedRestore = path.join(directory, "large-tampered.sql");
  await assert.rejects(() => decryptBackup(largeEncrypted, key, failedRestore));
  assert(!existsSync(failedRestore), "failed GCM authentication never publishes SQL");
  assert(
    !readFileSync(path.join(largeEncrypted, "manifest.json"), "utf8").includes(
      "private@example.invalid",
    ),
  );
  // The inclusive 1 GiB boundary must work in both crypto directions as well.
  truncateSync(largeSql, 1024 * 1024 * 1024);
  const boundaryEncrypted = path.join(directory, "boundary-encrypted"),
    boundaryRestored = path.join(directory, "boundary-restored.sql"),
    boundaryHash = await digest(largeSql);
  const boundaryManifest = await encryptBackup(largeSql, boundaryEncrypted, key);
  assert.equal(boundaryManifest.sha256, boundaryHash);
  await decryptBackup(boundaryEncrypted, key, boundaryRestored);
  assert.equal(statSync(boundaryRestored).size, 1024 * 1024 * 1024);
  assert.equal(await digest(boundaryRestored), boundaryHash);
  // Keep a bounded release budget. Reject oversized files before creating artifacts.
  truncateSync(largeSql, 1024 * 1024 * 1024 + 1);
  const rejectedDirectory = path.join(directory, "too-large");
  await assert.rejects(
    () => encryptBackup(largeSql, rejectedDirectory, key),
    (error) => /1073741825 bytes/.test(error.message) && /1073741824 bytes/.test(error.message),
  );
  assert(!existsSync(rejectedDirectory));
  truncateSync(largeCipher, 1024 * 1024 * 1024 + 1);
  await assert.rejects(
    () => decryptBackup(largeEncrypted, key, path.join(directory, "oversized.sql")),
    /size|large/i,
  );
  assert(!existsSync(path.join(directory, "oversized.sql")));
  await assert.rejects(
    () => encryptBackup(directory, path.join(directory, "non-file"), key),
    /size/i,
  );
  assert(!existsSync(path.join(directory, "non-file")));
  truncateSync(largeCipher, 0);
  await assert.rejects(
    () => decryptBackup(largeEncrypted, key, path.join(directory, "empty-cipher.sql")),
    /size/i,
  );
  assert(!existsSync(path.join(directory, "empty-cipher.sql")));
  assert(
    !readdirSync(directory).some((name) => name.endsWith(".part")),
    "failed recovery removes unauthenticated temporary SQL",
  );
  let calls = [];
  const configuration = {
    accountId: "test-account",
    worker: "remote-link-relay",
    token: "private-api-token",
    key: key.toString("base64"),
  };
  const existing = await ensureAppsVault(
    { ...configuration, key: undefined },
    async (url, init) => {
      calls.push(init.method);
      return Response.json({
        success: true,
        result: [{ name: "APP_TOKEN_KEY", type: "secret_text" }],
      });
    },
  );
  assert.deepEqual(existing, { created: false });
  assert.deepEqual(calls, ["GET"]);
  calls = [];
  const created = await ensureAppsVault(configuration, async (url, init) => {
    calls.push(init.method);
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer private-api-token");
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      assert.equal(body.name, "APP_TOKEN_KEY");
      assert.equal(body.text, configuration.key);
    }
    return Response.json({
      success: true,
      result: init.method === "GET" ? [] : { name: "APP_TOKEN_KEY" },
    });
  });
  assert.deepEqual(created, { created: true });
  assert.deepEqual(calls, ["GET", "PUT"]);
  await assert.rejects(
    () =>
      ensureAppsVault({ ...configuration, key: undefined }, async () =>
        Response.json({ success: true, result: [] }),
      ),
    /APP_TOKEN_KEY/,
  );
  await assert.rejects(
    () =>
      ensureAppsVault(configuration, async () =>
        Response.json(
          { success: false, errors: [{ message: "private-api-token" }] },
          { status: 403 },
        ),
      ),
    (error) => !error.message.includes("private-api-token"),
  );
  await assert.rejects(
    () => ensureAppsVault(configuration, async () => Response.json({ success: true, result: {} })),
    /list/,
  );
  await assert.rejects(
    () =>
      ensureAppsVault(configuration, async () =>
        Response.json({ success: true, result: [{ name: "APP_TOKEN_KEY", type: "text" }] }),
      ),
    /type/,
  );
  console.log(
    "Release operations: encrypted backup including a 257 MiB SQL round-trip, actual SQLite restore, inclusive 1 GiB crypto boundary, size bounds, tamper rejection, no overwrite and non-rotating Apps vault provisioning passed.",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
