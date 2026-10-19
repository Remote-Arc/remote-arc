# PR 218: workspace and customer follow-up refinement

The workspace now keeps one grouped Arc navigation across Chat, Tasks, Activity, Apps, Devices, Skills and Settings. Its mobile navigation is controlled by the parent so a click during lazy loading remains effective. One-off and recurring work share Tasks, with frequency/status filters, four editable starters and a natural-language handoff to the existing scheduling/management runtime.

Skills reuses the existing cloud definitions, canonical IDs, planner and permission-checked read-only runtime. Arc can discover, read, plan and run those skills through the shared services. Personal Markdown imports add encrypted, owner-scoped instructions alongside the cloud catalog; they do not train a model, install a repository or grant execution permissions. Arc checks referenced files, engines and dependencies before execution.

The model picker groups real configured models, supports keyboard selection and unavailable states, and stays inside the viewport. The chat canvas fills the available content area without the old 1420px background boundary. Neutral reading surfaces sit over soft sky light and fine orbital curves, with reduced-motion support and a quieter atmosphere during conversation. The welcome screen has a clearer composer, compact inline work metrics and grouped next actions; mobile uses the shared workspace toolbar without a duplicate welcome header. The original full Arc product page is restored. Setup and Remote MCP pages use neutral surfaces with sky accents, product dropdowns use logo assets and highlighted badges, and the public roadmap describes infrastructure/personal/industry/device-agent ambitions with exploratory status. The Chinese Connect and Remote MCP routes are now canonical localized pages rather than falling through to the homepage.

Plus and Pro have unlimited monthly Connect calls in the shared catalog, runtime, billing and public pricing. Model Credits, rate/concurrency limits, provider budgets and Free allowances remain independent. The internal cost model uses an editable expected Connect volume rather than presenting an unlimited worst-case margin.

Admin adds manual user follow-ups with five English/Chinese templates, personalization, immutable reviewable drafts, contact notes/status, due reminders, permission provenance, send history, suppression and feedback-form attribution. See `user-followups.md` for the operator workflow, configuration and delivery limits. The first version deliberately relies on operator reconciliation for provider delivery issues and replies; it does not generate periodic outreach.

## Validation

- Monorepo typecheck and production UI build.
- Relay security suite, including real SQLite auth/ownership, payment/credit/Stripe, cloud skills, native Arc and new manual follow-up cases. Provider HTTP is mocked.
- UI workspace/chat, security/PWA, marketing experience, cloud skill and SEO checks.
- Browser checks across 12 routes × desktop/mobile × light/dark × English/Chinese (96 combinations), including actual localized route content, overflow, navigation, menu placement and reduced motion.
- Chat redesign checks across 2560px, 1440px, 1024px and 390px × light/dark × English/Chinese (16 combinations), covering welcome/conversation layouts, full-width background, model-picker keyboard use, mobile navigation, reduced motion and simulated completion.
- Interactive browser checks for stable sidebar placement, combined task filters, cloud skills, Markdown import, chat handoff, model selection and simulated chat. Admin checks cover notes/permission, template personalization, saved drafts/history and the preview send lock.

No production deployment, real model call, email, live payment or production customer-data mutation was performed. The actual NZ Stripe sandbox additionally passed versioned pricing, a one-cycle promotion, hosted test-card Checkout, signed fulfillment and refund revocation. Apply migrations 0040–0045 through the normal release path. The PR preview remains isolated simulation; Admin writes and mail sending stay blocked there.


Further billing, models and memory work:

- Runtime commercial terms moved into versioned D1 configuration with Admin drafts, publication, history/restore, exact quote checks and retained subscription/trial terms. Public pricing, checkout, fulfillment and Credits use those versions. Admin Payments includes verified receipts, failed invoices, rated cost, public codes and private one-cycle offers; no real offer was published.
- Model selection now has ten manual models plus Auto, including direct economy models and four optional OpenRouter routes with explicit price/privacy/structured-output constraints. Adapter tests use mocked HTTP; real model availability is not claimed without provider credentials and bounded acceptance.
- Owner-scoped encrypted memory supports useful facts, bounded work recaps, relevant cross-chat retrieval and live device context. Settings provides inspect/edit/delete/disable/clear. Old in-flight saves cannot restore cleared data. Deleted chats also gain delayed content cleanup; payment/usage identifiers remain available for reconciliation.
- See [commercial configuration](commercial-configuration.md) and [personal memory](arc-personal-memory.md) for scope, cost bounds, operational limits and validation.
