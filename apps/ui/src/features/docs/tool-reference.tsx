import type { MessageKey } from "../../locales/locale-catalog.js";
import React, { useEffect, useState } from "react";
import data from "./tool-reference-data.generated.json" with { type: "json" };
import {
  TOOL_GROUPS,
  type ToolGroup,
} from "../../../../../packages/docs/src/tool-reference-meta.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/docs/tool-reference.css";

type Interface = "remote" | "apps" | "local";
type Schema = Record<string, unknown>;
type Entry = {
  id: string;
  name: string;
  title: string;
  description: string;
  summary: string;
  zh?: string;
  group: string;
  provider?: string;
  readOnly: boolean;
  scopes: string[];
  modes?: string[];
  unavailableIn?: string[];
  inputSchema: Schema;
};
// Clients receive the same remote MCP except where a tool lists unavailableIn
// (generated from each client profile's real tools/list).
const AI_CLIENTS = [
  { id: "chatgpt", name: "ChatGPT", logo: "/ai-openai.svg" },
  { id: "claude", name: "Claude", logo: "/ai-claude.svg" },
  { id: "cursor", name: "Cursor", logo: "/ai-cursor.svg" },
  { id: "gemini", name: "Gemini", logo: "/ai-gemini-four-color-2025.svg" },
] as const;
const availableIn = (entry: Entry, client: string) => !entry.unavailableIn?.includes(client);
function ClientChip({ client }: { client: (typeof AI_CLIENTS)[number] }) {
  return (
    <span className="toolClient">
      <img src={client.logo} alt="" width={14} height={14} />
      {client.name}
    </span>
  );
}
const entries: Record<Interface, Entry[]> = {
  remote: data.remote.map((tool) => ({ ...tool, id: "remote-" + tool.name })),
  apps: data.apps.flatMap((app) =>
    app.operations.map((operation) => ({
      id: "app-" + app.provider + "-" + operation.name,
      name: operation.name,
      title: app.name,
      provider: app.provider,
      description: operation.description,
      summary: operation.description,
      group: app.category,
      readOnly: operation.permission === "read",
      scopes: operation.permission === "read" ? ["apps:read"] : ["apps:read", "apps:write"],
      unavailableIn: "unavailableIn" in operation ? operation.unavailableIn : undefined,
      inputSchema: operation.inputSchema,
    })),
  ),
  local: data.local.map((tool) => ({
    ...tool,
    id: "local-" + tool.name,
    scopes: [],
  })),
};
const categoryAliases: Record<string, MessageKey> = {
  development: "docs.toolReference.categorySearch.development",
  communication: "docs.toolReference.categorySearch.communication",
  productivity: "docs.toolReference.categorySearch.productivity",
  design: "docs.toolReference.categorySearch.design",
  marketing: "docs.toolReference.categorySearch.marketing",
  data: "docs.toolReference.categorySearch.data",
  media: "docs.toolReference.categorySearch.media",
  finance: "docs.toolReference.categorySearch.finance",
};
const categories: Record<string, MessageKey> = {
  development: "docs.toolReference.category.development",
  communication: "docs.toolReference.category.communication",
  productivity: "docs.toolReference.category.productivity",
  design: "docs.toolReference.category.design",
  marketing: "docs.toolReference.category.marketing",
  data: "docs.toolReference.category.data",
  media: "docs.toolReference.category.media",
  finance: "docs.toolReference.category.finance",
};
function parameters(schema: Schema): { name: string; required: boolean }[] {
  const variants = [schema, ...([schema.oneOf, schema.anyOf].flat().filter(Boolean) as Schema[])];
  const fields = new Map<string, boolean>();
  for (const variant of variants) {
    for (const name of Object.keys((variant.properties || {}) as object)) {
      fields.set(name, fields.get(name) || ((variant.required || []) as string[]).includes(name));
    }
  }
  return [...fields].map(([name, required]) => ({ name, required }));
}
function ToolRow({ entry, kind }: { entry: Entry; kind: Interface }) {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const fields = parameters(entry.inputSchema);
  async function copy() {
    try {
      await navigator.clipboard.writeText(entry.name);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  const url = new URL(location.href);
  url.searchParams.set("type", kind);
  url.searchParams.delete("q");
  url.searchParams.delete("group");
  if (entry.provider) url.searchParams.set("app", entry.provider);
  else url.searchParams.delete("app");
  url.hash = entry.id;
  return (
    <article className="toolCatalogRow" id={entry.id}>
      <div className="toolCatalogName">
        <a href={url.pathname + url.search + url.hash}>
          <code>{entry.name}</code>
        </a>
        {kind === "apps" && <span>{entry.title}</span>}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={tr("docs.toolReference.copyToolName") + entry.name}
        >
          {copied ? tr("docs.toolReference.copied") : tr("docs.toolReference.copy")}
        </button>
      </div>
      <p>{locale === "zh" && entry.zh ? entry.zh : entry.summary}</p>
      <div className="toolCatalogBadges">
        <span>
          {entry.readOnly
            ? tr("docs.toolReference.readOnly")
            : tr("docs.toolReference.canChangeData")}
        </span>
        {entry.group === "browser-runner" && (
          <span>Beta · {tr("docs.toolReference.enablePerDevice")}</span>
        )}
        {entry.group === "goals" && <span>{tr("docs.toolReference.experimental")}</span>}
        {entry.scopes.map((scope) => (
          <code key={scope}>{scope}</code>
        ))}
        {entry.modes?.map((mode) => (
          <code key={mode}>{mode}</code>
        ))}
      </div>
      {kind !== "local" && entry.unavailableIn?.length ? (
        <p className="toolClientSupport">
          <span>{tr("docs.toolReference.availableIn")}</span>
          {AI_CLIENTS.filter((client) => availableIn(entry, client.id)).map((client) => (
            <ClientChip key={client.id} client={client} />
          ))}
          <span>{tr("docs.toolReference.notAvailableIn")}</span>
          {AI_CLIENTS.filter((client) => !availableIn(entry, client.id)).map((client) => (
            <span className="toolClientUnavailable" key={client.id}>
              <ClientChip client={client} />
            </span>
          ))}
        </p>
      ) : null}
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          {tr("docs.toolReference.parametersAndContract")}
          {fields.length > 0 && (
            <small>
              {fields
                .slice(0, 5)
                .map((field) => field.name + (field.required ? " *" : ""))
                .join(" · ")}
              {fields.length > 5 ? " …" : ""}
            </small>
          )}
        </summary>
        {open && (
          <div className="toolCatalogContract">
            {kind !== "apps" && <p>{entry.description}</p>}
            <p>{tr("docs.toolReference.anAsteriskMarksARequiredParameter")}</p>
            <pre>
              <code>{JSON.stringify(entry.inputSchema, null, 2)}</code>
            </pre>
          </div>
        )}
      </details>
      {copyError && <p role="status">{tr("docs.toolReference.selectTheToolNameToCopy")}</p>}
    </article>
  );
}
export function ToolReference() {
  const { tr, locale } = useI18n();
  const initial = new URLSearchParams(location.search);
  const [kind, setKind] = useState<Interface>(
      (["remote", "apps", "local"].includes(initial.get("type") || "")
        ? initial.get("type")
        : "remote") as Interface,
    ),
    [query, setQuery] = useState(initial.get("q") || ""),
    [group, setGroup] = useState(initial.get("group") || ""),
    [provider, setProvider] = useState(initial.get("app") || ""),
    [access, setAccess] = useState(""),
    [client, setClient] = useState(
      AI_CLIENTS.some((item) => item.id === initial.get("client")) ? initial.get("client")! : "",
    );
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  const needle = query.trim().toLowerCase();
  const source = entries[kind];
  const groups = [...new Set(source.map((entry) => entry.group))];
  const filtered = source.filter(
    (entry) =>
      (!group || entry.group === group) &&
      (!provider || kind !== "apps" || entry.provider === provider) &&
      (!access || (access === "read") === entry.readOnly) &&
      (!client || kind === "local" || availableIn(entry, client)) &&
      (!needle ||
        [
          entry.name,
          entry.title,
          entry.description,
          entry.summary,
          entry.zh,
          TOOL_GROUPS[entry.group as ToolGroup]?.zh,
          TOOL_GROUPS[entry.group as ToolGroup]?.en,
          categorySearchAlias(entry.group),
          ...entry.scopes,
          ...parameters(entry.inputSchema).map((field) => field.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
  function categorySearchAlias(id: string) {
    const category = categories[id];
    if (!category) return "";
    return tr(categoryAliases[id]!);
  }
  function switchKind(value: Interface) {
    setKind(value);
    setGroup("");
    setProvider("");
    setAccess("");
    const url = new URL(location.href);
    url.searchParams.set("type", value);
    url.searchParams.delete("app");
    url.searchParams.delete("group");
    url.hash = "";
    history.replaceState(history.state, "", url);
  }
  function chooseClient(value: string) {
    setClient(value);
    const url = new URL(location.href);
    if (value) url.searchParams.set("client", value);
    else url.searchParams.delete("client");
    history.replaceState(history.state, "", url);
  }
  function groupName(id: string) {
    const copy = TOOL_GROUPS[id as ToolGroup];
    const category = categories[id];
    return copy ? tr(copy.en, copy.zh) : category ? tr(category) : id;
  }
  return (
    <main className="technicalDoc toolCatalog">
      <header className="articleHeader">
        <span className="eyebrow">REMOTE ARC / TOOLS</span>
        <h1>{tr("docs.toolReference.everyToolInOnePlace")}</h1>
        <p>{tr("docs.toolReference.searchByNameTaskAppOr")}</p>
        <div className="articleMetaLinks">
          <a href={localizedWebsiteHref("/docs/mcp", locale)}>
            {tr("docs.toolReference.connectYourAi")} →
          </a>
          <a href={localizedWebsiteHref("/docs/apps", locale)}>
            {tr("docs.toolReference.connectAnApp")} →
          </a>
        </div>
      </header>
      <div
        className="toolCatalogTabs"
        role="tablist"
        aria-label={tr("docs.toolReference.toolConnectionType")}
      >
        {(["remote", "apps", "local"] as Interface[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={"toolCatalogTab-" + value}
            aria-selected={kind === value}
            aria-controls="toolCatalogResults"
            tabIndex={kind === value ? 0 : -1}
            onKeyDown={(event) => {
              const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const types: Interface[] = ["remote", "apps", "local"];
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? 2
                    : (types.indexOf(value) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              switchKind(types[next]!);
              document.getElementById("toolCatalogTab-" + types[next])?.focus();
            }}
            onClick={() => switchKind(value)}
          >
            {value === "remote"
              ? "Remote MCP"
              : value === "apps"
                ? tr("docs.toolReference.appActions")
                : tr("docs.toolReference.localMcp")}
            <small>{entries[value].length}</small>
          </button>
        ))}
      </div>
      <p className="toolCatalogExplanation">
        {kind === "remote"
          ? tr("docs.toolReference.toolsExposedByRemoteArcS")
          : kind === "apps"
            ? tr("docs.toolReference.arcSAppLibraryContainsOperations", {
                length: entries.apps.length,
                length2: data.apps.length,
              })
            : tr("docs.toolReference.localStdioMcpRunsOnThe")}
      </p>
      {kind !== "local" && (
        <div className="toolClientLegend">
          <div
            className="toolClientFilter"
            role="group"
            aria-label={tr("docs.toolReference.showToolsForAnAiClient")}
          >
            <button type="button" aria-pressed={!client} onClick={() => chooseClient("")}>
              {tr("docs.toolReference.allAiClients")}
            </button>
            {AI_CLIENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={client === item.id}
                onClick={() => chooseClient(client === item.id ? "" : item.id)}
              >
                <img src={item.logo} alt="" width={16} height={16} />
                {item.name}
              </button>
            ))}
          </div>
          <p>{tr("docs.toolReference.everyToolWorksInChatgptClaude")}</p>
        </div>
      )}
      <div className="toolCatalogFilters">
        <label className="toolCatalogSearch">
          <span>{tr("docs.toolReference.findATool")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("docs.toolReference.eGUploadGithubProcessId")}
          />
        </label>
        <label>
          <span>{tr("docs.toolReference.category")}</span>
          <select
            aria-label={tr("docs.toolReference.category")}
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="">{tr("docs.toolReference.allCategories")}</option>
            {groups.map((value) => (
              <option key={value} value={value}>
                {groupName(value)}
              </option>
            ))}
          </select>
        </label>
        {kind === "apps" && (
          <label>
            <span>{tr("docs.toolReference.app")}</span>
            <select
              aria-label={tr("docs.toolReference.app")}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="">{tr("docs.toolReference.allApps")}</option>
              {data.apps.map((app) => (
                <option key={app.provider} value={app.provider}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>{tr("docs.toolReference.access")}</span>
          <select
            aria-label={tr("docs.toolReference.access")}
            value={access}
            onChange={(event) => setAccess(event.target.value)}
          >
            <option value="">{tr("docs.toolReference.allOperations")}</option>
            <option value="read">{tr("docs.toolReference.readOnly")}</option>
            <option value="write">{tr("docs.toolReference.canChangeData")}</option>
          </select>
        </label>
      </div>
      <div className="toolCatalogCount" role="status">
        {tr("docs.toolReference.ofTools", { length: filtered.length, length2: source.length })}
      </div>
      <section id="toolCatalogResults" role="tabpanel" aria-labelledby={"toolCatalogTab-" + kind}>
        {filtered.map((entry) => (
          <ToolRow key={kind + entry.id} entry={entry} kind={kind} />
        ))}
        {!filtered.length && (
          <p className="toolCatalogEmpty">{tr("docs.toolReference.noMatchesTryAToolName")}</p>
        )}
      </section>
      <footer className="toolCatalogFootnote">
        <p>{tr("docs.toolReference.readWriteLabelsDescribeCapabilityNot")}</p>
        <a href={localizedWebsiteHref("/docs/troubleshooting", locale)}>
          {tr("docs.toolReference.aToolIsMissingInYour")} →
        </a>
      </footer>
    </main>
  );
}
