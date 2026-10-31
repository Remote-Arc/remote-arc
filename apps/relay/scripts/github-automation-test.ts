// Tests for GitHub App JWT generation, installation token negotiation, and PR merge
// automation in tasks/github-automation.ts.
import assert from "node:assert/strict";
import {
  githubAutomationConfigured,
  mergeGitHubPullRequest,
  type GitHubMergeSpec,
} from "../src/tasks/github-automation.js";

// 1. Configuration check
assert.equal(githubAutomationConfigured({}), false);
assert.equal(githubAutomationConfigured({ GITHUB_APP_ID: "123" }), false);
assert.equal(githubAutomationConfigured({ GITHUB_APP_PRIVATE_KEY: "key" }), false);
assert.equal(githubAutomationConfigured({ GITHUB_APP_ID: "123", GITHUB_APP_PRIVATE_KEY: "key" }), true);

// 2. Unconfigured environment throws
const spec: GitHubMergeSpec = {
  type: "github_merge_pr",
  owner: "remote-arc",
  repo: "remote-arc",
  pull_number: 42,
  installation_id: "inst-100",
  merge_method: "squash",
};

await assert.rejects(
  async () => mergeGitHubPullRequest({}, spec),
  /GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required/,
);

// 3. Generate a real test RSA PKCS#8 key pair for WebCrypto
const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign"],
);
const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
let binaryKey = "";
for (const byte of new Uint8Array(pkcs8)) binaryKey += String.fromCharCode(byte);
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binaryKey)}\n-----END PRIVATE KEY-----`;

const env = {
  GITHUB_APP_ID: "app-999",
  GITHUB_APP_PRIVATE_KEY: pem,
  GITHUB_APP_INSTALLATION_ID: "inst-default",
  GITHUB_API_BASE_URL: "https://mock.github.test",
};

// Missing installation ID throws
await assert.rejects(
  async () => mergeGitHubPullRequest({ ...env, GITHUB_APP_INSTALLATION_ID: undefined }, { ...spec, installation_id: undefined }),
  /GitHub installation ID is missing for this automation/,
);

// 4. Mock fetch for GitHub API endpoints
const originalFetch = globalThis.fetch;
try {
  let tokenCalled = false;
  let mergeCalled = false;
  let sentMergeBody: unknown = null;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";

    if (url.includes("/access_tokens") && method === "POST") {
      tokenCalled = true;
      const auth = (init?.headers as Record<string, string>)?.authorization;
      assert.ok(auth?.startsWith("Bearer "));
      const [header, payload, sig] = auth.slice("Bearer ".length).split(".");
      assert.ok(header && payload && sig, "JWT should have 3 segments");
      const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
      assert.equal(claims.iss, "app-999");
      return Response.json({ token: "ghs_mockInstallationToken123" });
    }

    if (url.includes("/pulls/42/merge") && method === "PUT") {
      mergeCalled = true;
      const auth = (init?.headers as Record<string, string>)?.authorization;
      assert.equal(auth, "Bearer ghs_mockInstallationToken123");
      sentMergeBody = JSON.parse(String(init?.body));
      return Response.json({ merged: true, sha: "commit-sha-42", message: "Pull Request successfully merged" });
    }

    return new Response("Not found", { status: 404 });
  };

  // Successful merge
  const result = await mergeGitHubPullRequest(env, spec);
  assert.equal(tokenCalled, true);
  assert.equal(mergeCalled, true);
  assert.equal(result.merged, true);
  assert.equal(result.sha, "commit-sha-42");
  assert.equal(result.repository, "remote-arc/remote-arc");
  assert.equal(result.pull_number, 42);
  assert.equal(result.merge_method, "squash");
  assert.deepEqual(sentMergeBody, { merge_method: "squash" });

  // Merge failure handling
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/access_tokens")) {
      return Response.json({ token: "token" });
    }
    if (url.includes("/pulls/42/merge")) {
      return Response.json({ message: "Base branch was modified. Review and try the merge again." }, { status: 405 });
    }
    return new Response("error", { status: 500 });
  };

  await assert.rejects(
    async () => mergeGitHubPullRequest(env, spec),
    /GitHub PR merge failed: Base branch was modified/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS: GitHub App JWT minting, installation tokens, PR merge dispatches and failure handling");
