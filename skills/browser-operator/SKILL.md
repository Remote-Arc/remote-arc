---
name: browser-operator
description: Operate an authorized browser using DOM snapshots and repeatable actions.
priority: P0
category: browser
status: builtin-guidance
---

# Browser Operator

**Scope:** agent-browser + Microsoft Playwright MCP. **Source:** https://github.com/vercel-labs/agent-browser

## Workflow

Use existing Remote Arc browser_read_page / browser_extract_links for read-only work first. For complex DOM workflows, use locally approved agent-browser or Playwright, in a separate profile; never attach to personal sessions without explicit permission. Steps: 1) confirm device, origin and requested interaction scope; 2) snapshot DOM and locate stable accessible selectors; 3) plan bounded clicks/fills; 4) ask permission for modifying site state, checkout, account settings, irreversible submissions; 5) verify changed page and report evidence. Keep navigation URLs within allowed origins. Never use anti-bot evasion, cookie export, credential harvesting or silent downloads. Headless browser must be explicitly chosen; a Chrome extension tab is a different permission boundary. CLI examples only after installation: agent-browser open https://example.com; agent-browser snapshot -i; agent-browser close. If browser CLI is absent, use existing Remote Arc browser tools and report limits.

## Device and permission gates

Required authorization scopes: browser:read, browser:interact. Scripts, OS/desktop actions, external service side effects, media generation and paid API usage require independent user-approved execution permissions. This skill does not elevate Remote Arc Tool privileges or authorize use of hidden credentials.

## Preflight

Call `remotelink skills doctor` on the selected device, or inspect dependencies using already authorized process/file tools. Missing executors must be installed explicitly on the correct user device. A Skill being built-in is NOT evidence an engine is present.

## Evidence of completion

Report input constraints, executed tools and device, verified output path/result, permissions used, cost (if known) and failures. Do not imply successful execution from merely writing a plan.
