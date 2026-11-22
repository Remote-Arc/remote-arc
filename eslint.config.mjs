import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const runtimeGlobals = {
  ...globals.node,
  ...globals.browser,
  ...globals.worker,
  ...globals.serviceworker,
  ...globals.webextensions,
};
const unused = {
  argsIgnorePattern: "^_",
  varsIgnorePattern: "^_",
  caughtErrors: "none",
  ignoreRestSiblings: true,
};

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wrangler/**",
      "work/**",
      "coverage/**",
      "packages/skills/vendor/**",
      ".agents/**",
      ".claude/**",
      ".gemini/**",
      "skills/**",
      "**/*.generated.*",
      "apps/ui/public/downloads/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: runtimeGlobals },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", unused],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: runtimeGlobals },
    rules: {
      // TypeScript resolves Worker/browser types; ESLint handles runtime rules.
      "no-undef": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Existing provider payloads and fixture adapters are deliberately dynamic.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", unused],
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  },
  {
    files: ["apps/ui/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
  // Formatting has one owner: Prettier. Semantic ESLint rules stay enabled.
  prettier,
);
