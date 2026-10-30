import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

// Wrangler records applied migrations by full filename, so these historical
// pairs are safe. Renaming one would re-run it in production. New migrations
// take a fresh number.
const historicalPairs = new Set(["0005", "0027", "0052"]);

const names = readdirSync(new URL("../apps/relay/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
const byPrefix = new Map();
for (const name of names) {
  assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/, `${name} must be NNNN_lower_snake_case.sql`);
  const prefix = name.slice(0, 4);
  byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
}
for (const [prefix, files] of byPrefix) {
  if (historicalPairs.has(prefix)) assert.equal(files.length, 2, `${prefix} is a known pair; do not add a third migration or rename one`);
  else assert.equal(files.length, 1, `Migration number ${prefix} is used twice: ${files.join(", ")}`);
}
for (const prefix of historicalPairs) assert.ok(byPrefix.has(prefix), `Applied migration pair ${prefix} must not be renamed or removed`);
console.log(`PASS: ${names.length} migrations have unique numbers apart from ${historicalPairs.size} historical pairs`);
