---
name: structure-code
description: Decide where new code goes and keep files, folders, user-facing text, styles and shared logic organised. Use this whenever you create a file, component, module or folder, add a feature that spans several files, or touch a file or folder that is already too large, even if the task only asks for behaviour. It prevents giant files, flat folders, hard-coded interface text and copied permission checks.
---

# Structure code

Code that works can still be hard to change. Left alone, agents add to whichever
file is open until it is thousands of lines long, drop every new file into one
folder, write interface text straight into components, and copy the same
permission check into every screen. Each of these makes the next change slower and
riskier, for people and for the next agent.

## When to use

Any change that adds code. Apply it to the code you add or touch. To reorganise
existing code without changing behaviour, follow `refactor-safely` as well. For a
UI, also read `references/frontend.md`.

## Steps

1. **Learn the project's structure first.** Read the architecture or contributing
   docs, the lint config and the top-level source folders. Find where it already
   keeps shared helpers, hooks or services, styles, messages and tests. The
   project's own convention wins over this skill. Copy the pattern of the nearest
   well-organised feature, not the nearest file.

2. **Place each new piece before you write it.** Write a short list of the files
   you will add or change and the reason each lives there:

   | Kind of code | Belongs in |
   | --- | --- |
   | Rendering and layout | A component file for that view |
   | State, data loading and actions | A hook, service or controller beside it |
   | Pure rules and data shaping | A plain module with no framework imports |
   | Requests to a server or API | One client module per resource |
   | Interface text | The message catalog, one file per language |
   | Styles | A style file grouped by the same domain as the code |
   | Values read across the whole app | One shared provider or context |

3. **Keep each file to one job.** Aim for under 300 lines in a hand-written file.
   Past 500, split it before you add more. Split by responsibility, such as view,
   state, requests and pure rules, never by cutting a file in half. Generated
   files and data files are exempt.

4. **Keep folders easy to scan.** When a folder holds more than about 15 files,
   group them into subfolders by feature or domain. Use the same domain names for
   code, styles, messages and tests, so that one name finds everything about a
   feature. Do not add a layer of nesting that holds one file.

5. **Put interface text in the message catalog.** If the project supports more
   than one language, or has a catalog at all, never write user-facing text in a
   component. Add a key to every language file in the same change. Use named
   placeholders such as `{count}`, not text joined together, because word order
   differs between languages. Make an unknown key fail loudly in development and
   tests. Map error codes to messages in one place.

6. **Give shared logic one entry point.** Permission checks, feature flags, the
   current user or session, theme and language each get one named function or
   hook, such as `can(user, "billing:manage")`. Screens call it and never repeat
   its condition. A copied condition drifts, and then two screens disagree. Hiding
   a control is only for display: the server must still check every request, so
   follow `secure-change` for the server side.

7. **Use a provider for app-wide values only.** Values that many distant
   components read, such as the current user, language, theme or permissions,
   belong in one context or provider. State used by one screen stays in that
   screen or its hook. Give each provider an accessor that throws a clear error
   when it is used outside the provider.

8. **Group styles.** Keep design tokens, reset and base layout in a few global
   files that load once, in a fixed order. Put feature styles in a folder that
   mirrors the feature folders. Use the existing tokens or variables instead of
   repeating raw colours and sizes. Do not append a new feature's rules to a large
   global stylesheet.

9. **Remove what you replace.** When new code takes over from old code, delete the
   old page, its state, requests, styles, messages and test fixtures, and redirect
   old URLs. Dead code left beside new code gets copied by the next agent.

10. **Update the map.** If the project documents its folders, such as in an
    architecture file or a README, update that table in the same change.

11. **Check the shape of your diff.** List the line counts of the files you added
    or grew. Search your diff for user-facing text outside the catalog, raw colour
    values and repeated permission conditions. Fix what you added, then follow
    `verify-and-report`.

## Stop and ask when

- The project's convention conflicts with this skill and you cannot tell which the
  user wants.
- Placing the code well means moving a lot of existing code. Propose a separate
  refactor and do the task in the existing structure.
- A split would change a public API or exported names.
- The project has no message catalog or style system, and adding one would mean a
  new dependency.

## Common mistakes

| Tempting move | Why it fails | Do this instead |
| --- | --- | --- |
| Add the feature to the open file | Files grow to thousands of lines | Place it by step 2 |
| Put every new file in one folder | Nobody can find anything | Group by feature at about 15 files |
| Write `lang === "en" ? a : b` in a component | Text is untranslatable and untestable | Add a catalog key per language |
| Copy `user.role === "admin"` into a screen | Rules drift apart | Call the one permission entry point |
| Pass user and theme through five layers | Every layer changes for one value | Read them from a provider |
| Add a global provider for one screen | Re-renders and hidden coupling | Keep that state local |
| Append rules to the global stylesheet | One file owns every feature | Add a feature style file |
| Keep the old version "just in case" | It gets copied and maintained | Delete it and redirect |
| Reorganise the whole repository | Unreviewable, and out of scope | Structure what you touch |

## Example

Task: "Add a billing page where owners can change the plan."

Weak plan: "Add `BillingPage` to `app.tsx`."

Strong plan:

```markdown
Files:
- features/billing/billing-page.tsx: layout only
- hooks/billing/use-billing.ts: load the plan, change it, error state
- api/billing.ts: the two requests
- locales/en/billing.json, locales/es/billing.json: every label and error
- styles/billing/billing-page.css: page styles, using existing tokens
- the permission module: add "billing:manage" for owners; the page calls can()
- architecture doc: add the billing folder
Not changed: app.tsx only gains the route.
Server: the plan change endpoint checks the owner role itself.
```

## Report

```markdown
Placement: <each new file and why it lives there>
File sizes: <touched files with lines before -> after>
Shared entry points used: <messages, permissions, flags, providers>
Removed: <old code, styles and messages deleted, and redirects added>
Seen but not changed: <structure problems outside this task>
```
