# Agent pricing research

Checked against official pages on **2026-10-18**. Prices below are monthly billing unless explicitly marked annual. USD except Dust (EUR, excluding VAT). These are competitor facts, not approved Remote Arc prices.

| Product | Paid entry and included usage | Trial / free allowance | Usage and expiry |
| --- | --- | --- | --- |
| [Lindy](https://www.lindy.ai/pricing/) | Team starts at **$29.99 per active user / month**, adding **3,000 credits** to a shared pool. Higher credit bundles and custom Enterprise terms. | **7 days**, advertised **$50 in credits**, no card. | Consumption follows work size and model choice. Monthly credits do not roll over; top-ups **$10 / 1,000 credits**, retained until used. Credit-consuming actions pause when depleted. |
| [Composio](https://composio.dev/pricing) | Pro **$29 / month**, including **$29 usage credit** beyond free allowances. | Hobby: **100,000 tool calls + 50,000 trigger events / month**, three members. Shared Composio OAuth apps have lower allowances within those totals. | Own-app/API-key/MCP overage: **$0.0003 / call**, **$0.003 / delivered trigger**. Shared OAuth: 20,000 free calls then $0.0005/call. Pro supports overage spending caps; monthly credit expires. Provider-funded Instant Tools charge separately. New-signup pricing applies from August 15, 2026. |
| [Manus](https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus) | Pro **$20 / 4,000 credits**, **$40 / 8,000 credits** per month. Team starts at $20/seat/month. Annual discount approximately 17%. | Free: **300 daily refresh credits**, but **1,500 monthly consumption cap** on those credits. The $40 tier advertises a **7-day trial**. | Credits cover model tokens, cloud machines and third-party APIs. Monthly credits expire each cycle. Add-ons carry forward while a paid subscription remains active. Active work can slightly overshoot the balance; new tasks stop at zero. |
| [Dust](https://dust.tt/home/pricing) | Pro **€30 / seat / month**, 8,000 credits. Max **€150**, 40,000 credits. Annual billing: **€24 / €120 per seat per month**. | Free seats: **500 lifetime credits**. | Per-message usage varies with model, task and tools. Monthly credits do not roll over. An active response finishes; paid seats may then use admin-enabled capped workspace overage. All plans expose the model catalog. Programmatic usage has a separate $0.01/credit rate. |

Manus credit details: [official consumption and expiry rules](https://help.manus.im/en/articles/11711097-what-are-the-rules-for-credits-consumption-and-how-can-i-obtain-them). Its help page says the checkout page governs the final offer. Lindy's advertised trial value is retail credit value, not a disclosure of model-provider cost.

## Implications for Remote Arc

These products' credit units are different. Comparing “3,000” with “8,000” does not establish which provides more work. Composio primarily prices connection and execution infrastructure; its free tool-call allowance is not an equivalent allowance of hosted autonomous model work.

For Remote Arc, preserve two separate meters:

- **Connect:** hosted MCP connections and tool calls; the user's existing AI provides inference.
- **Arc:** hosted model work across Apps and the user's computers, including autonomous tasks and routines. Remote Arc supplies the model credentials.

The recommended structure to evaluate is a subscription with included Arc credits, optional prepaid top-ups, and no automatic overage by default. Keep the agreed **14-day explicit-activation trial**, bounded usage, and readable history after expiry. Powerful models consume more credits; they do not require users to bring API keys.

Before choosing a price or credit allowance, measure typical Auto tasks, premium-model tasks, app-heavy routines and local-computer work. Model tokens, platform execution and any platform-paid third-party API charges need an internal cost breakdown. Upstream services billed to the user's own connected account remain separate and must not be presented as included Arc spending.

## Implementation status

The billing wallet foundation is being prepared in a separate branch. Earlier proposed Remote Arc dollar amounts and credit bundles are **unapproved drafts**. This research does not enable payments, publish a new price list, or change existing customer entitlements.
