# Synthetic session fixtures v1

Research fixtures for #253; no real transcript, credential or source code is
included. `__WORKSPACE__` is replaced with a synthetic absolute path in memory.

| Source | Fixture | Boundary |
| --- | --- | --- |
| Codex | basic.jsonl | Metadata preceding visible messages/tool acknowledgements |
| Codex | partial.jsonl | Known metadata with compaction and a truncated trailing record |
| Claude | basic.jsonl | Main session identity and message ancestry |
| Claude | resume.jsonl | Initial bookkeeping, missing ancestry and compaction marker |

These are format examples, not a promise to reconstruct complete history or
certify vendor versions. The read-only probe checks only metadata; a separate
source adapter must qualify retained visible history and effects. A recorded
CLI version is evidence about a file, not proof of its authenticity.
