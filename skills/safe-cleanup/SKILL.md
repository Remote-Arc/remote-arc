---
name: safe-cleanup
description: Reclaim disk space safely on Windows, macOS or Linux by inspecting exact targets, avoiding shell quoting hazards, and using verified permanent deletion only when appropriate.
priority: P0
category: productivity
status: builtin-guidance
---

# Safe Cleanup — reclaim disk space without collateral deletion

Use this Skill before any AI-initiated disk cleanup, recursive deletion, cache purge, bulk move, or storage-reclamation task via Remote Arc. **Freeing space is a real goal**: moving files to the Recycle Bin or a quarantine folder on the same filesystem usually does **not** free that filesystem's capacity. Do not promise otherwise or silently retain a seven-day full-size copy.

A Skill guides the calling AI; it is **not** an enforcement mechanism, OS sandbox, backup, or permission grant. The local Safety Guard has a narrow signature list. Trusted Write Locations constrain supported file tools and require an in-scope working directory for terminal commands, but **do not confine shell side effects** to that directory. Local Undo does not cover shell deletion. Never claim this Skill makes arbitrary terminal commands safe.

## Device and permission gates

Operate only on the user's authorized device, with existing `computer:read` and, for deletion, `computer:write` and the required tool permission. Use no privilege escalation, hidden credentials, unrequested device, network upload, external storage billing, or disabling of Safety Guard. When terminal access is off, produce a safe cleanup plan; don't enable it yourself.

## Choose a space-reclamation method

1. **Exact disposable data (preferred):** After the checks below, permanently delete only positively identified, user-authorized temporary/cache/build outputs using supported OS-native file operations. This actually reclaims space on the affected volume; no mandatory seven-day retention. Check whether the cache is owned by an active process.
2. **Uncertain or personal data:** Inspect first, obtain specific user approval for the exact target and irreversible effect, or ask the user to perform deletion manually on the device if safe enforcement is unavailable. Never infer that photos, documents, media collections, projects, backups, or other valuable files are disposable because they are large.
3. **Recoverable alternative:** Offer Recycle Bin or same-volume quarantine only if the user wants a recovery window **instead of** immediate free-space recovery. A different-volume backup can free the source volume after deletion, but consumes that destination's space and requires user approval.
4. **Safer non-deletion alternatives:** Uninstall through the platform package manager, clear a documented application cache, rotate a known log, remove a verified build artifact, or change where future downloads/cache are stored, if this achieves the goal with lower risk.

## Mandatory preflight before a permanent deletion

- Identify the requested **device**, target **volume**, precise **absolute path**, intended contents, owner/application, and whether a process is using it. Do not guess the drive from context or expand a vague request into all large files.
- Enumerate and record (without modifying) resolved/canonical target path, actual parent, filesystem/volume ID where possible, file count, approximate logical bytes, free bytes on that volume, and a representative listing. Do not follow directory symlinks/junctions/mount points while traversing candidates. A size estimate is not a promise of reclaimed space.
- Block ambiguous command-line targeting: unmatched/misnested quotes, mixed CMD/PowerShell quoting, shell metacharacters, wildcard/glob expansion, variable interpolation, relative paths, blank paths, drive-relative paths, path separators or escape sequences that change the intended target, and paths whose canonical identity cannot be verified. **Windows `\` is a path separator, not a harmless escape character; quoted paths can be reinterpreted across nested shells.**
- Reject volume/filesystem roots; system directories; user/home roots; Downloads/Documents/Desktop/Pictures or similarly personal directories; credential or browser-profile stores; backup roots; mixed-purpose parent directories; any ancestor of the intended target; paths outside the explicitly approved scope; and paths that unexpectedly resolve to a different parent or volume.
- Never “fix” a failed delete by widening the target, falling back to its parent, changing the drive letter, adding recursive flags, or suppressing errors. If a folder is locked, stop and explain which process/files remain rather than deleting a broader path.
- Prefer a structured file API with a separately passed literal path, no shell string concatenation, no nested `cmd /c` or PowerShell wrapping, and no wildcard-derived selection. When Remote Arc only offers `start_process`, don't treat its `cwd` or Safety Guard regex as proof of containment. Use a vetted narrowly scoped utility with structured arguments; absent a trustworthy implementation, stop and request on-device manual action for risky deletion.
- Inspect exact target immediately before the operation (including parent identity, reparse point/symlink status, requested list and bound scope). Refuse on changed/mismatched identity or unexpected new contents. Prefer an operation that cannot follow path redirects between validation and mutation; otherwise explicitly acknowledge the remaining race risk.

## Action decision

- **Low risk:** Precisely selected disposable files inside a verified cache/temp/build subtree, no protected or unexpected files, bounded size, and no path ambiguity. The user's request to clean that exact subtree can authorize permanent deletion without a redundant seven-day holding period.
- **Needs explicit confirmation:** Bulk or recursive permanent deletion, surprising file classes or size, nonstandard cache location, broad user folder, requested folder containing important-looking content, or a plan that differs from the user's initial scope. Present canonical path, drive, representative contents, approximate size, what cannot be restored, and a specific proposed action. No vague “confirm cleanup” prompt.
- **Never automatically proceed:** Disk/root/home/system targets, credential stores, unresolved links, multi-hop quoting, changed targets, suspected path escape, and any attempt to bypass local policy. Do not allow a user's generic permission to free disk space to waive this boundary. For a truly intentional root erase, require a separate manual OS workflow.

## Execute and verify

1. Present the selected exact paths and estimated space recovery; record free bytes **before**.
2. Execute only the approved narrow action. Do not print a potentially destructive copy-paste shell command if a safe structured method is available. Stop on the first validation mismatch or access error.
3. Reinspect the target and compare actual free bytes **after** on the same volume; report both measurements, number of objects removed, leftovers/locked files, and any filesystem delay. Large apparent deletion might reclaim less capacity because of snapshots, open handles, sparse files, compression, or hard links.
4. Report whether deletion was **permanent**, recoverable by the OS, or not executed. Never say “saved in recovery” and “space freed” for the same-volume retained data; never claim Local Undo can restore a terminal deletion.

## 中文提醒

用户说“清理 C 盘 / D 盘、腾空间、删缓存、永久删除”时，先选准**具体目录**、检查真实绝对路径和文件类型，再决定是否删除。需要立刻腾空间时，同盘回收站/隔离区不是解决方案。遇到反斜杠、引号、CMD 嵌套 PowerShell、递归参数、盘符根目录、路径跳转或未知目标，一律停止，不猜测、不扩大删除范围。既要真的释放磁盘空间，也不能把整盘误删。