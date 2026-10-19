# Apps tool coverage and cost ownership

29 Apps, 221 implemented native operations, 8 categories. Every App gained additional operations in this expansion. HTTP contract and real SQLite tests cover dispatch and replay; this does not certify real OAuth acceptance. Apps ship through Connect and are reused by Arc. Read and write tools are enabled together when the account is connected. Upstream scopes and account permissions still apply.

| App | Tools | Reads | Writes | Auth | Cost responsibility |
| --- | ---: | ---: | ---: | --- | --- |
| GitHub | 15 | 11 | 4 | oauth | provider_rules |
| Slack | 35 | 23 | 12 | oauth | provider_rules |
| Gmail | 15 | 7 | 8 | oauth | provider_rules |
| Outlook | 10 | 4 | 6 | oauth | provider_rules |
| Google Calendar | 8 | 5 | 3 | oauth | provider_rules |
| Outlook Calendar | 9 | 4 | 5 | oauth | provider_rules |
| YouTube | 6 | 6 | 0 | oauth | provider_rules |
| Google Drive | 8 | 4 | 4 | oauth | provider_rules |
| Google Docs | 5 | 1 | 4 | oauth | provider_rules |
| Google Sheets | 6 | 2 | 4 | oauth | provider_rules |
| Google Search Console | 4 | 4 | 0 | oauth | provider_rules |
| Google Analytics | 4 | 4 | 0 | oauth | provider_rules |
| Google Ads | 4 | 4 | 0 | oauth | provider_rules |
| Facebook | 5 | 4 | 1 | oauth | provider_rules |
| Instagram | 8 | 4 | 4 | oauth | provider_rules |
| Meta Ads | 6 | 5 | 1 | oauth | provider_rules |
| Vercel | 6 | 5 | 1 | oauth | provider_rules |
| Runway | 5 | 3 | 2 | api_key | connected_account |
| X | 5 | 3 | 2 | oauth | platform_project |
| WhatsApp Business | 6 | 4 | 2 | api_key | connected_account |
| Atlassian Jira | 7 | 5 | 2 | oauth | provider_rules |
| Atlassian Confluence | 5 | 4 | 1 | oauth | provider_rules |
| Notion | 8 | 5 | 3 | oauth | provider_rules |
| Shopify | 6 | 5 | 1 | oauth | provider_rules |
| LinkedIn | 4 | 1 | 3 | oauth | provider_rules |
| Supabase | 5 | 4 | 1 | oauth | connected_account |
| Linear | 5 | 4 | 1 | oauth | connected_account |
| HubSpot | 6 | 4 | 2 | oauth | provider_rules |
| Salesforce | 5 | 3 | 2 | oauth | provider_rules |

`connected_account` means usage is charged under the user's provider account (for example Runway API Credits, which differ from its web subscription). `platform_project` means the OAuth developer project can pay, currently managed X access; an explicit cost policy and bounded platform funding are required. `provider_rules` means there is no blanket free-API promise: account plan, platform project quotas, app reviews and provider pricing decide the actual cost. Advertising spend belongs to the advertising account.

The executable catalog is in the Apps directory generator. Run `pnpm saas:apps` to inspect current counts and classifications. See [Arc platform economics](./arc-platform-launch.md) for payment/model/hosting cost assumptions and the 70% target.
