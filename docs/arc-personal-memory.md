# Personal memory and storage

Memory is managed by Arc and survives a change of chat or model. It does not rely on a ChatGPT/Claude consumer subscription's memory feature. It reuses the existing encrypted D1 vault and owner authentication; no vector database, embedding call or additional summarization model is required for this initial bounded library.

The storage layers have separate purposes:

| Layer | Contents and limits |
| --- | --- |
| Personal facts | Up to 100 preferences/project/context notes, at most 768 UTF-8 bytes each |
| Recent work | Up to 40 recaps using excerpts of the existing request/reply, at most 2,048 bytes each; older recaps are evicted |
| Model recall | Up to 8 relevant records within 4,000 serialized UTF-8 bytes |
| Device index | Current owner-scoped device name/platform/last-seen records, at most 8 per model context; verify current availability with live tools |
| Chat/work history | Separate encrypted product history and execution evidence; not copied wholesale into memory |

At the configured maxima, memory text is at most 158,720 bytes per user (about 155 KiB). Ten thousand fully populated users would hold roughly 1.59 GB of plaintext memory, **before** encryption/base64, rows, indexes, replicas, backups, chat and task storage. This is a sizing bound, not measured storage usage. Text ciphertext has additional overhead. Monitor actual D1 database size; paid capacity/partitioning is needed before reaching its limits. Large artifacts belong in separately controlled object storage or on the user's device, rather than in the memory table.

Facts saved through the agent must be exact quotations from the current user's message, never invented facts or extracted tool/web instructions. Scheduled automation cannot add personal facts or delete memory. Common credential patterns are rejected. An exact quotation can still be inaccurate or sensitive, so the UI exposes source, correction and removal, and the prompt treats all memory as fallible historical data rather than permissions or instructions. Work recaps are excerpt-based conversation records, not independently verified completion evidence.

Relevance uses a small owner-only scan, keywords and Chinese bigrams, with durable preferences prioritized. Retrieval is bounded before model dispatch. Replacing that scan with semantic retrieval is a later quality optimization, not a prerequisite for continuity. Old work can expire; stable facts require user/agent correction. Do not promise perfect recall, literal knowledge of all user activity, or recovery of every past conversation.

Settings → Memory supports viewing, search, direct add/edit/delete, source links, enable/disable and clearing all. Memory is enabled by default with those visible controls. Disabling stops recall and saves, but retains notes so they can be inspected/deleted. Clearing removes personal facts and recaps without deleting chats. Generation and creation-time fences prevent older in-flight work from restoring deleted/cleared content. Already sent provider requests cannot be recalled.

Chat deletion initially hides/cancels that chat. A bounded scheduled cleanup becomes eligible after 24 hours and after its execution deadlines, removes message bodies and encrypted step payloads, and clears the title. It retains identifiers and rated-usage/payment records needed for reconciliation. Cleanup batches 25 conversations every five minutes; it is not an immediate backup-erasure guarantee. Active chat content remains intact. No late assistant message can be appended to a deleted conversation. Memory, task evidence, connected-service records and provider-retained data have separate controls; clearing one does not claim to erase all others.

Tests use real SQLite and encryption for cross-chat recall, tenant isolation, quote verification, secret rejection, disable/clear/delete races, note caps, recap eviction, bounded context, history separation and deleted-chat cleanup. Browser checks cover both locales/themes, desktop/mobile and memory CRUD, toggles and clear confirmation.
