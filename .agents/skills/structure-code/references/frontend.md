# Frontend structure

Use this with `structure-code` for a web or app UI. Examples use React and
TypeScript, but the same shape works in Vue, Svelte, Angular or a mobile app.
Follow the project's own layout where it has one.

## A layout that scales

```text
src/
  app/            providers and the app shell: i18n, theme, routing
  components/     UI shared by several features
  features/
    billing/      one folder per feature: views and their small parts
    settings/
  hooks/          shared hooks at the top, feature hooks in a subfolder
    billing/
    use-permission.ts
    use-i18n.ts
  lib/            framework-free helpers and pure rules
  locales/
    en/           one folder per language
      common.json
      billing.json
    es/
  styles/         global files at the top, feature styles in subfolders
    tokens.css
    base.css
    billing/
  types/
```

Each feature uses the same name in `features/`, `hooks/`, `locales/` and
`styles/`, so a search for the name finds all of it.

## Components render, hooks decide

A component file holds markup and event wiring. Move these out once they are more
than a few lines:

- Data loading, polling and refresh: `hooks/<feature>/use-<thing>.ts`
- Actions that call the server: a hook, using one client module per resource
- Rules that do not need the framework, such as sorting or a status label: `lib/`

A 1,000-line component is usually three things: a view, a state hook and a model.
Split along those lines.

## Messages

- Keep one dictionary per language, and split it by surface or feature when it
  grows, such as `common`, `website`, `dashboard` and `admin`. Load only the
  active language and the current surface, so that every page does not download
  every string.
- Derive the key type from the base language file, so that a missing or misspelt
  key fails the type check:

  ```ts
  import type Billing from "./en/billing.json";
  export type MessageKey = keyof Billing["messages"];
  ```

- The translator throws on an unknown key, and fills named placeholders:
  `t("billing.seats", { count })`.
- When the user switches language, finish loading the new dictionary before you
  re-render, or the screen shows a mix of two languages.
- Errors from the server carry a stable code. One function maps each code to a
  message key.
- Do not leave a second way to write text inline, such as `t(englishText,
  spanishText)`. Agents will keep using it.

## Context and providers

- Keep the context object in its own file, the provider component in another, and
  the accessor hook in `hooks/`. Hot reload and imports stay simple.
- The accessor throws outside its provider:

  ```ts
  export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error("useTheme must be used inside ThemeProvider");
    return value;
  }
  ```

- Good candidates: current user and session, language, theme, permissions,
  feature flags. Poor candidates: a form's fields, a dialog's open state, one
  list's filter.

## Permissions and feature flags

Name each permission, and decide it in one place:

```ts
type Permission = "admin:access" | "billing:manage" | "members:remove";

export function usePermission(user: User | null) {
  const can = useCallback(
    (permission: Permission) => {
      switch (permission) {
        case "admin:access":
          return user?.isAdmin === true;
        case "billing:manage":
          return user?.role === "owner";
        case "members:remove":
          return user?.role === "owner" || user?.role === "admin";
      }
    },
    [user],
  );
  return { can };
}
```

Screens write `can("billing:manage")`, never `user.role === "owner"`. Feature
flags get the same treatment with a separate helper, such as
`isEnabled("newCheckout", flags)`, so that a permission is never confused with a
rollout switch. The UI only hides controls. The server checks every request.

## Styles

- Load global files once, in a fixed order: tokens, reset, base layout, shared
  components, then features.
- A feature imports its own style file from `styles/<feature>/`.
- Use tokens such as `var(--color-danger)` instead of raw values, so that themes
  and dark mode keep working.
- Scope feature rules with a feature class or a CSS module, so that they cannot
  leak into another page.

## When you restructure an existing UI

- Move files with `git mv`, and commit moves apart from behaviour changes.
- Delete retired pages together with their state, requests, styles, messages and
  test fixtures, and redirect their old URLs.
- Measure what each entry point loads at startup before and after, and check that
  it requests only its own language and surface files.
- Test both languages in the browser, including a language switch.
