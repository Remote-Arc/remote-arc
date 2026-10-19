# PR 218: workspace and customer follow-up refinement

The workspace now keeps one grouped Arc navigation across Chat, Tasks, Activity, Apps, Devices, Skills and Settings. Its mobile navigation is controlled by the parent so a click during lazy loading remains effective. One-off and recurring work share Tasks, with frequency/status filters, four editable starters and a natural-language handoff to the existing scheduling/management runtime.

Skills reuses the existing cloud definitions, canonical IDs, planner and permission-checked read-only runtime. Arc can discover, read, plan and run those skills through the shared services. Personal Markdown imports add encrypted, owner-scoped instructions alongside the cloud catalog; they do not train a model, install a repository or grant execution permissions. Arc checks referenced files, engines and dependencies before execution.

The model picker groups real configured models, supports keyboard selection and unavailable states, and stays inside the viewport. The chat canvas adds soft moving light with reduced-motion support. The original full Arc product page is restored. Setup and Remote MCP pages use neutral surfaces with sky accents, product dropdowns use logo assets and highlighted badges, and the public roadmap describes infrastructure/personal/industry/device-agent ambitions with exploratory status. The Chinese Connect and Remote MCP routes are now canonical localized pages rather than falling through to the homepage.

Plus and Pro have unlimited monthly Connect calls in the shared catalog, runtime, billing and public pricing. Model Credits, rate/concurrency limits, provider budgets and Free allowances remain independent. The internal cost model uses an editable expected Connect volume rather than presenting an unlimited worst-case margin.

Admin adds manual user follow-ups with five English/Chinese templates, personalization, immutable reviewable drafts, contact notes/status, due reminders, permission provenance, send history, suppression and feedback-form attribution. See `user-followups.md` for the operator workflow, configuration and delivery limits. The first version deliberately relies on operator reconciliation for provider delivery issues and replies; it does not generate periodic outreach.

## Validation

- Monorepo typecheck and production UI build.
- Relay security suite, including real SQLite auth/ownership, payment/credit/Stripe, cloud skills, native Arc and new manual follow-up cases. Provider HTTP is mocked.
- UI workspace/chat, security/PWA, marketing experience, cloud skill and SEO checks.
- Browser checks across 12 routes × desktop/mobile × light/dark × English/Chinese (96 combinations), including actual localized route content, overflow, navigation, menu placement and reduced motion.
- Interactive browser checks for stable sidebar placement, combined task filters, cloud skills, Markdown import, chat handoff, model selection and simulated chat. Admin checks cover notes/permission, template personalization, saved drafts/history and the preview send lock.

No production deployment, real model call, email, payment or customer-data mutation was performed. Apply migrations 0040 and 0041 through the normal release path. The PR preview remains isolated simulation; Admin writes and mail sending stay blocked there.
