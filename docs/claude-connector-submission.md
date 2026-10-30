# Claude directory submission — unified Remote Arc MCP

Remote Arc serves every AI host from the same URL:
`https://mcp.remotearc.app/mcp`. There is **no separate Claude deployment**.

## OAuth and connector setup

- Existing OAuth 2.0 authorization code + PKCE and dynamic client registration (DCR) stay unchanged.
- For Claude, choose **Register automatically** for the OAuth client (DCR).
  The "Use Claude's published identity" setting requires CIMD, which this
  authorization server does not yet advertise.
- After OAuth, a token's registered `client_id` is joined to its saved
  redirect URIs. Only Anthropic's published HTTPS callbacks
  `https://claude.ai/api/mcp/auth_callback` and
  `https://claude.com/api/mcp/auth_callback` establish the Claude profile.
  Self-declared client names and HTTP User-Agent are never used.
- Coverage: remote connectors added in Claude on the web, desktop and mobile
  authorize through those callbacks, so they all receive the Claude profile.
  Claude Code and other local clients authorize through a `localhost`
  callback that any program can use; they cannot be distinguished and
  receive the generic profile. The profile is cached per server isolate for
  at most 10 minutes.
- Because the MCP URL is shared, unauthenticated discovery remains generic.
  Complete Claude OAuth before inspecting its restricted tool catalog.

## Host-appropriate capabilities

- **Other hosts (including ChatGPT):** unchanged public MCP schema, Apps
  provider catalog (including Runway), Skills, local tools, OAuth scopes,
  limits, and security rules.
- **Claude:** same endpoint and the same tool names, schemas and handlers,
  with three differences:
  - The Runway provider and its 8 read/write actions are excluded from typed
    Apps action schemas, Apps discovery and server-side dispatch.
  - The Skill library is not offered: no `find_skills` or `read_skill` tools,
    no Skill MCP Resources and no server `instructions` (42 tools instead of
    44). Skills are an external instruction source, and several bundled media
    Skills mention local AI voice and music models.
  - Every tool description comes from
    `apps/relay/src/mcp/mcp-claude-descriptions.ts`. Each one describes only its
    own tool: no references to other tools, no directions to the model and no
    links. `apps/relay/scripts/public-mcp-test.ts` fails if a Claude tool has no
    entry there or breaks these rules.
- All other local device, browser, file, task, automation and Apps
  operations follow the same execution implementation and permissions.
- The public tool directory (`/docs/tools`) marks tools and App actions that
  are not available in Claude. The marks are generated from the real Claude
  `tools/list` by `pnpm docs:tools`.
- These policy limits are not a security sandbox. A general-purpose
  terminal is capable of invoking arbitrary installed programs, so
  Anthropic may still evaluate the scope of that capability during review.

## Reviewer preparation

1. Verify the real Claude OAuth flow using **Register automatically**.
2. Provide a dedicated isolated reviewer account and deterministic
   Review Desktop fixture. Never grant access to a real user's computer.
3. Verify `tools/list` under both an authenticated Claude OAuth grant
   and an authenticated ChatGPT grant, including the different Runway schemas,
   the missing Skill tools and the Claude descriptions.
4. Test representative reads, reversible edits and expected error feedback.
5. Verify no hosted AI media generation or Skill text is reachable through Claude.
6. Supply privacy, terms, support, and at least three working prompts.
7. Anthropic's directory team makes the final approval decision; passing
   local tests cannot guarantee listing.

The shared live service is not changed merely by merging this code;
production deployment and verification are separate steps.

## Step 8: reviewer access and test evidence

Anthropic has a separate reserved identity (`reviewer-anthropic-v1`), password
login and Review Desktop. Configure `ANTHROPIC_REVIEWER_EMAIL`,
`ANTHROPIC_REVIEWER_PASSWORD_SHA256` and `ANTHROPIC_REVIEWER_DEMO_DEVICE_ID`
through Cloudflare's protected settings. Preserve the existing `REVIEWER_*`
settings, which belong to OpenAI. Never commit reviewer passwords or put them in
public documentation or PR comments.

The protected Production Release workflow has an opt-in
`configure_claude_reviewer` switch. Its three GitHub Secrets are
`ANTHROPIC_REVIEWER_EMAIL`, `ANTHROPIC_REVIEWER_PASSWORD` and
`ANTHROPIC_REVIEWER_DEMO_DEVICE_ID`. It derives the runtime password hash,
provisions only the Anthropic settings after deployment, and runs
`scripts/verify-claude-reviewer.mjs`. Existing complete reviewer credentials are
retained; a partial configuration stops the workflow for inspection. The smoke
report lists untested public tools and does not claim a Claude conversation
or complete tool coverage.

Reviewers open `https://mcp.remotearc.app/auth/login`, choose Reviewer access,
and sign in with the dedicated credentials supplied in the submission portal.
They can authorize `https://mcp.remotearc.app/mcp` through Claude's automatically
registered OAuth client without Google login, mailbox access or an OTP.

The deterministic Review Desktop provides eight device operations:
`list_directory`, `read_file`, `get_file_info`, `list_processes`,
`start_process`, `write_file`, `edit_block` and `undo_last_change`.
Its files are restricted to `/review-demo`, and its terminal accepts a safe
command allowlist. Logging in resets only that reviewer's fixture state.
The two reviewers cannot access each other's devices or file overlays.
Normal Google and email-OTP login cannot claim either reserved identity.

This fixture does **not** provide Browser Runner, a shared Chrome tab, a real
Agent, or preconnected third-party Apps. Do not describe it as full coverage of
the public connector. A successful representative fixture test is not evidence
that every advertised tool has passed. Before checking the portal's Self-tested
box, exercise every advertised tool with its real prerequisites through MCP
Inspector and a Claude custom connector, and retain the actual results. The
official checklist is at
https://claude.com/docs/connectors/building/review-criteria.

For production follow-up, verify both reviewer logins independently, complete
authorization-code + PKCE and a refresh-token exchange, confirm the authenticated
Claude catalog excludes Runway and the Skill library, and run the fixture
read/write/edit/undo prompts. Record the deployed SHA and actual outcomes. Keep
remaining untested capabilities listed explicitly in the handoff.
