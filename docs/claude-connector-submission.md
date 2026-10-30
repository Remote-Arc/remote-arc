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
- **Claude:** identical top-level MCP tool names and endpoint, but the
  Runway provider and its 8 read/write actions are excluded from typed
  Apps action schemas, Apps discovery and server-side dispatch.
- Claude also cannot access bundled `image-studio` or `video-creator`
  AI-generation guidance through Skill discovery, direct reads, or
  MCP Resources. Imported user Skills are not exposed to Claude.
- All other local device, browser, file, task, automation and Apps
  operations follow the same execution implementation and permissions.
- These policy limits are not a security sandbox. A general-purpose
  terminal is capable of invoking arbitrary installed programs, so
  Anthropic may still evaluate the scope of that capability during review.

## Reviewer preparation

1. Verify the real Claude OAuth flow using **Register automatically**.
2. Provide a dedicated isolated reviewer account and deterministic
   Review Desktop fixture. Never grant access to a real user's computer.
3. Verify `tools/list` under both an authenticated Claude OAuth grant
   and an authenticated ChatGPT grant, including the different Runway schemas.
4. Test representative reads, reversible edits and expected error feedback.
5. Verify no hosted AI media generation is reachable through Claude.
6. Supply privacy, terms, support, and at least three working prompts.
7. Anthropic's directory team makes the final approval decision; passing
   local tests cannot guarantee listing.

The shared live service is not changed merely by merging this code;
production deployment and verification are separate steps.
