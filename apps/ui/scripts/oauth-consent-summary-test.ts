import assert from "node:assert/strict";
import { summarizeConsentScopes } from "../src/features/auth/oauth-consent-summary.ts";
const initial = summarizeConsentScopes([
  "devices:read", "computer:read", "computer:write", "browser:read",
  "apps:read", "apps:write", "offline_access",
]);
assert.deepEqual(initial.map(g => g.key), ["devices", "browser", "apps", "session"]);
assert(initial.find(g => g.key === "apps")?.descriptionZh.includes("逐次审批"));
assert(initial.find(g => g.key === "devices")?.descriptionZh.includes("运行命令"));
const readOnly = summarizeConsentScopes(["apps:read", "computer:read"]);
assert(readOnly.find(g => g.key === "apps")?.descriptionZh.includes("不会自动连接新账号"));
assert(!readOnly.find(g => g.key === "apps")?.descriptionZh.includes("逐次审批"));
assert.deepEqual(summarizeConsentScopes(["browser:interact", "automation:write"]).map(g => g.key), ["browser", "automation"]);
assert.equal(summarizeConsentScopes([]).length, 0);
console.log("OAuth consent grouping tests passed.");
