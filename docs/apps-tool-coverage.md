# Apps tool coverage

37 Apps, 344 unique native operations, eight categories. Every App has at least eight tools and at least three write tools. Run `pnpm apps:inventory` for JSON or append `--write` to regenerate this document. The dispatch suite enforces uniqueness and per-App depth.

| App | Tools | Reads | Writes | Available write operations |
| --- | ---: | ---: | ---: | --- |
| GitHub | 15 | 11 | 4 | `issues.create`, `issues.update`, `comments.create`, `actions.rerun` |
| Slack | 35 | 23 | 12 | `messages.send`, `messages.update`, `messages.delete`, `messages.schedule`, `scheduled.delete`, `reactions.add`, `reactions.remove`, `pins.add`, `pins.remove`, `bookmarks.add`, `bookmarks.edit`, `bookmarks.remove` |
| Gmail | 15 | 7 | 8 | `drafts.create`, `messages.send`, `messages.modify`, `drafts.send`, `drafts.delete`, `messages.trash`, `messages.untrash`, `labels.create` |
| Outlook | 10 | 4 | 6 | `drafts.create`, `messages.send`, `messages.reply`, `messages.move`, `messages.markRead`, `drafts.send` |
| Google Calendar | 8 | 5 | 3 | `events.create`, `events.update`, `events.delete` |
| Outlook Calendar | 9 | 4 | 5 | `events.create`, `events.update`, `events.delete`, `events.accept`, `events.decline` |
| Google Slides | 8 | 3 | 5 | `presentations.create`, `slides.create`, `text.replaceAll`, `text.insert`, `shapes.createTextbox` |
| OneDrive | 8 | 4 | 4 | `folders.create`, `files.rename`, `files.delete`, `files.move` |
| Microsoft Excel | 8 | 4 | 4 | `worksheets.create`, `ranges.update`, `tables.create`, `rows.append` |
| Microsoft Teams | 8 | 5 | 3 | `messages.send`, `messages.update`, `messages.softDelete` |
| Microsoft To Do | 8 | 4 | 4 | `lists.create`, `tasks.create`, `tasks.update`, `tasks.delete` |
| Dropbox | 8 | 4 | 4 | `folders.create`, `files.move`, `files.copy`, `files.delete` |
| Asana | 8 | 5 | 3 | `tasks.create`, `tasks.update`, `comments.create` |
| Airtable | 8 | 4 | 4 | `records.create`, `records.update`, `records.delete`, `records.deleteBatch` |
| YouTube | 11 | 6 | 5 | `playlists.create`, `playlists.update`, `playlists.delete`, `playlistItems.insert`, `playlistItems.delete` |
| Google Drive | 8 | 4 | 4 | `folders.create`, `files.copy`, `files.rename`, `files.trash` |
| Google Docs | 8 | 1 | 7 | `documents.create`, `documents.insertText`, `documents.replaceText`, `documents.deleteText`, `documents.insertTable`, `documents.setHeading`, `documents.setBold` |
| Google Sheets | 8 | 2 | 6 | `values.update`, `spreadsheets.create`, `values.append`, `values.clear`, `sheets.rename`, `rows.insert` |
| Google Search Console | 8 | 4 | 4 | `sitemaps.submit`, `sitemaps.delete`, `sites.add`, `sites.delete` |
| Google Analytics | 8 | 5 | 3 | `customDimensions.create`, `customDimensions.update`, `customDimensions.archive` |
| Google Ads | 8 | 4 | 4 | `campaigns.pause`, `adGroups.pause`, `ads.pause`, `labels.create` |
| Facebook | 8 | 4 | 4 | `posts.create`, `posts.update`, `posts.delete`, `comments.create` |
| Instagram | 8 | 4 | 4 | `comments.reply`, `media.create`, `media.publish`, `comments.delete` |
| Meta Ads | 8 | 5 | 3 | `campaigns.pause`, `adSets.pause`, `ads.pause` |
| Vercel | 9 | 5 | 4 | `deployments.cancel`, `env.create`, `env.update`, `env.delete` |
| Runway | 8 | 4 | 4 | `videos.generate`, `tasks.cancel`, `images.generate`, `videos.fromImage` |
| X | 8 | 3 | 5 | `posts.create`, `posts.delete`, `likes.create`, `likes.delete`, `bookmarks.create` |
| WhatsApp Business | 8 | 4 | 4 | `messages.send`, `templates.send`, `templates.create`, `templates.delete` |
| Atlassian Jira | 8 | 5 | 3 | `issues.create`, `comments.create`, `issues.update` |
| Atlassian Confluence | 8 | 4 | 4 | `pages.create`, `pages.update`, `pages.delete`, `comments.create` |
| Notion | 8 | 5 | 3 | `pages.create`, `blocks.appendText`, `pages.archive` |
| Shopify | 8 | 5 | 3 | `products.createDraft`, `products.update`, `products.archive` |
| LinkedIn | 8 | 2 | 6 | `posts.create`, `posts.update`, `posts.delete`, `images.initializeUpload`, `videos.initializeUpload`, `videos.finalizeUpload` |
| Supabase | 8 | 5 | 3 | `database.query`, `secrets.upsert`, `functions.delete` |
| Linear | 8 | 4 | 4 | `issues.create`, `issues.update`, `comments.create`, `comments.delete` |
| HubSpot | 8 | 4 | 4 | `contacts.create`, `contacts.update`, `contacts.archive`, `deals.update` |
| Salesforce | 8 | 4 | 4 | `contacts.create`, `contacts.update`, `contacts.delete`, `opportunities.update` |

## Access and verification

Connect grants are checked at execution. MCP writes require `apps:write`; provider scopes, tenant ownership and installation grants still apply. Existing connections keep their original grants and must explicitly reconnect for newly required scopes. Read-only grants cannot invoke writes. Broad discovery returns compact counts; selected-App discovery returns operation descriptions, permissions and requested scopes. The UI shows write counts, per-tool access badges and read/write filters.

Tests use actual source, encrypted connections and SQLite with mocked provider HTTP. They validate all operation dispatches, provider contracts, concurrent replay, secret redaction and missing scopes. These checks do not establish real-account acceptance. Provider registration, reviews, eligible account types and credentials gate readiness. Google Slides reuses Google OAuth; the four Microsoft Apps reuse Microsoft OAuth; Dropbox, Asana and Airtable need platform applications.

Cost ownership and limits remain documented in [Apps expansion](apps-expansion.md) and [Apps cost ownership](apps-cost-ownership.md). Runway estimates are checked before generation; they are not provider-enforced spending caps. Advertising writes pause resources or create labels and do not enable campaigns or change budgets.
