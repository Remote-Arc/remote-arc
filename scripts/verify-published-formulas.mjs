import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangelog } from "./release-content.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** Source builds must not overwrite the formula for an already published binary. */
export async function verifyPublishedFormulas(root = repositoryRoot, fetchRelease = fetch) {
  const [stable] = parseChangelog(await readFile(path.join(root, "CHANGELOG.md"), "utf8"));
  assert(stable, "A published stable release is required for Homebrew verification");
  await Promise.all(["remotelink.rb", "remotelink-go.rb"].map(async filename => {
    const url = `https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${stable.version}/${filename}`;
    const response = await fetchRelease(url, { signal: AbortSignal.timeout(30_000) });
    assert(response.ok, `Cannot verify published ${filename}: HTTP ${response.status}`);
    const published = (await response.text()).replaceAll("\r\n", "\n");
    assert(published.length > 0 && published.length < 32_000, `Invalid published ${filename}`);
    const committed = (await readFile(path.join(root, "Formula", filename), "utf8")).replaceAll("\r\n", "\n");
    assert.equal(committed, published, `${filename} must preserve the published ${stable.version} formula; do not replace released checksums with a development build`);
  }));
  return stable.version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Published Homebrew formulas verified against immutable remotelink-v${await verifyPublishedFormulas()} release assets.`);
}
