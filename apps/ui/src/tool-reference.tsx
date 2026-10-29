import React, { useEffect, useState } from "react";
import data from "./tool-reference-data.generated.json" with { type: "json" };
import {
  TOOL_GROUPS,
  type ToolGroup,
} from "../../../packages/docs/src/tool-reference-meta.js";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./tool-reference.css";

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
  inputSchema: Schema;
};
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
      scopes:
        operation.permission === "read"
          ? ["apps:read"]
          : ["apps:read", "apps:write"],
      inputSchema: operation.inputSchema,
    })),
  ),
  local: data.local.map((tool) => ({
    ...tool,
    id: "local-" + tool.name,
    scopes: [],
  })),
};
const categories: Record<string, { en: string; zh: string }> = {
  development: { en: "Development", zh: "开发" },
  communication: { en: "Communication", zh: "沟通" },
  productivity: { en: "Productivity", zh: "效率" },
  design: { en: "Design", zh: "设计" },
  marketing: { en: "Marketing", zh: "营销" },
  data: { en: "Data", zh: "数据" },
  media: { en: "Media", zh: "媒体" },
  finance: { en: "Finance", zh: "财务" },
};
function parameters(schema: Schema): { name: string; required: boolean }[] {
  const variants = [
    schema,
    ...([schema.oneOf, schema.anyOf].flat().filter(Boolean) as Schema[]),
  ];
  const fields = new Map<string, boolean>();
  for (const variant of variants) {
    for (const name of Object.keys((variant.properties || {}) as object)) {
      fields.set(
        name,
        fields.get(name) ||
          ((variant.required || []) as string[]).includes(name),
      );
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
          aria-label={tr("Copy tool name: ", "复制工具名：") + entry.name}
        >
          {copied ? tr("Copied", "已复制") : tr("Copy", "复制")}
        </button>
      </div>
      <p>{locale === "zh" && entry.zh ? entry.zh : entry.summary}</p>
      <div className="toolCatalogBadges">
        <span>
          {entry.readOnly
            ? tr("Read only", "只读")
            : tr("Can change data", "可修改数据")}
        </span>
        {entry.group === "browser-runner" && (
          <span>Beta · {tr("Enable per device", "按设备开启")}</span>
        )}
        {entry.group === "goals" && (
          <span>{tr("Experimental", "实验能力")}</span>
        )}
        {entry.scopes.map((scope) => (
          <code key={scope}>{scope}</code>
        ))}
        {entry.modes?.map((mode) => (
          <code key={mode}>{mode}</code>
        ))}
      </div>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          {tr("Parameters and contract", "参数与工具定义")}
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
            <p>
              {tr(
                "An asterisk marks a required parameter. Actions may require further fields; the full schema below is the reference.",
                "星号表示必填参数。不同动作可能还需要其他字段，完整定义见下方。",
              )}
            </p>
            <pre>
              <code>{JSON.stringify(entry.inputSchema, null, 2)}</code>
            </pre>
          </div>
        )}
      </details>
      {copyError && (
        <p role="status">
          {tr(
            "Select the tool name to copy it manually.",
            "可选中工具名后手动复制。",
          )}
        </p>
      )}
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
    [access, setAccess] = useState("");
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({block: "start"});
  }, []);
  const needle = query.trim().toLowerCase();
  const source = entries[kind];
  const groups = [...new Set(source.map((entry) => entry.group))];
  const filtered = source.filter(
    (entry) =>
      (!group || entry.group === group) &&
      (!provider || kind !== "apps" || entry.provider === provider) &&
      (!access || (access === "read") === entry.readOnly) &&
      (!needle ||
        [
          entry.name,
          entry.title,
          entry.description,
          entry.summary,
          entry.zh,
          TOOL_GROUPS[entry.group as ToolGroup]?.zh,
          TOOL_GROUPS[entry.group as ToolGroup]?.en,
          categories[entry.group]?.zh,
          ...entry.scopes,
          ...parameters(entry.inputSchema).map((field) => field.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
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
  function groupName(id: string) {
    const copy = TOOL_GROUPS[id as ToolGroup] || categories[id];
    return copy ? tr(copy.en, copy.zh) : id;
  }
  return (
    <main className="technicalDoc toolCatalog">
      <header className="articleHeader">
        <span className="eyebrow">REMOTE ARC / TOOLS</span>
        <h1>{tr("Every tool, in one place.", "所有工具，一处查全。")}</h1>
        <p>
          {tr(
            "Search by name, task, app or parameter. Open a tool to inspect its permissions and exact input contract.",
            "按名称、用途、应用或参数搜索，展开即可查看权限与准确的输入定义。",
          )}
        </p>
        <div className="articleMetaLinks">
          <a href={localizedWebsiteHref("/docs/mcp", locale)}>
            {tr("Connect your AI", "连接你的 AI")} →
          </a>
          <a href={localizedWebsiteHref("/docs/apps", locale)}>
            {tr("Connect an app", "连接应用账号")} →
          </a>
        </div>
      </header>
      <div
        className="toolCatalogTabs"
        role="tablist"
        aria-label={tr("Tool connection type", "工具连接方式")}
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
              const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (types.indexOf(value) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
              switchKind(types[next]!);
              document.getElementById("toolCatalogTab-" + types[next])?.focus();
            }}
            onClick={() => switchKind(value)}
          >
            {value === "remote"
              ? "Remote MCP"
              : value === "apps"
                ? tr("App actions", "Apps 操作")
                : tr("Local MCP", "本地 MCP")}
            <small>{entries[value].length}</small>
          </button>
        ))}
      </div>
      <p className="toolCatalogExplanation">
        {kind === "remote"
          ? tr(
              "Tools exposed by Remote Arc's remote MCP server. What your AI can use depends on your authorization, plan, device version and enabled capabilities. Its current tool list is the final reference.",
              "Remote Arc 远程 MCP 服务提供的工具。实际可用范围取决于授权、套餐、设备版本及已开启能力，以你的 AI 当前看到的工具列表为准。",
            )
          : kind === "apps"
            ? tr(
                `Arc's App library contains ${entries.apps.length} operations across ${data.apps.length} apps. The remote MCP lists every operation with its exact arguments in two tools: run_app_read_action for reads and run_app_write_action for changes. list_apps returns your connection IDs and searches actions by use_case. Provider setup and account permissions still apply.`,
                `Arc 的 Apps 库包含 ${data.apps.length} 个应用、${entries.apps.length} 个操作。远程 MCP 在两个工具中逐一列出每个操作及其准确参数：run_app_read_action 负责读取，run_app_write_action 负责更改；list_apps 返回连接 ID 并按 use_case 搜索操作；可用性仍取决于服务商配置和账号授权。`,
              )
            : tr(
                "Local stdio MCP runs on the computer that starts it: remotelink --mcp --safe. Safe, developer and full modes expose different subsets. A workspace-only connection is narrower still. It does not provide cloud App or Browser Runner tools.",
                "本地 stdio MCP 在启动它的电脑上执行：remotelink --mcp --safe。safe、developer、full 模式开放不同工具子集，限定工作区的连接范围更窄，不提供云端 Apps 或 Browser Runner 工具。",
              )}
      </p>
      <div className="toolCatalogFilters">
        <label className="toolCatalogSearch">
          <span>{tr("Find a tool", "查找工具")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr(
              "e.g. upload, GitHub, process_id…",
              "例如：上传、GitHub、process_id…",
            )}
          />
        </label>
        <label>
          <span>{tr("Category", "分类")}</span>
          <select
            aria-label={tr("Category", "分类")}
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="">{tr("All categories", "全部分类")}</option>
            {groups.map((value) => (
              <option key={value} value={value}>
                {groupName(value)}
              </option>
            ))}
          </select>
        </label>
        {kind === "apps" && (
          <label>
            <span>{tr("App", "应用")}</span>
            <select
              aria-label={tr("App", "应用")}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="">{tr("All apps", "全部应用")}</option>
              {data.apps.map((app) => (
                <option key={app.provider} value={app.provider}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>{tr("Access", "操作类型")}</span>
          <select
            aria-label={tr("Access", "操作类型")}
            value={access}
            onChange={(event) => setAccess(event.target.value)}
          >
            <option value="">{tr("All operations", "全部操作")}</option>
            <option value="read">{tr("Read only", "只读")}</option>
            <option value="write">{tr("Can change data", "可修改数据")}</option>
          </select>
        </label>
      </div>
      <div className="toolCatalogCount" role="status">
        {tr(
          `${filtered.length} of ${source.length} tools`,
          `${source.length} 个工具中匹配 ${filtered.length} 个`,
        )}
      </div>
      <section
        id="toolCatalogResults"
        role="tabpanel"
        aria-labelledby={"toolCatalogTab-" + kind}
      >
        {filtered.map((entry) => (
          <ToolRow key={kind + entry.id} entry={entry} kind={kind} />
        ))}
        {!filtered.length && (
          <p className="toolCatalogEmpty">
            {tr(
              "No matches. Try a tool name, another category or another connection type.",
              "没有匹配结果。试试工具名、其他分类或其他连接方式。",
            )}
          </p>
        )}
      </section>
      <footer className="toolCatalogFootnote">
        <p>
          {tr(
            "Read/write labels describe capability, not permission to act. Connected app changes require apps:write; computer and browser actions follow device policy. Skills are workflow guidance and do not add tools or grant access.",
            "读写标记描述工具能力，不代表自动获得执行授权。应用写入需要 apps:write，电脑与浏览器动作遵循设备策略。Skill 提供工作方法，不会增加工具或授予权限。",
          )}
        </p>
        <a href={localizedWebsiteHref("/docs/troubleshooting", locale)}>
          {tr("A tool is missing in your AI?", "AI 里找不到工具？")} →
        </a>
      </footer>
    </main>
  );
}
