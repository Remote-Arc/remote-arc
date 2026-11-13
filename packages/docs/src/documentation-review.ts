import type { DocTopic } from "./catalog.js";
import { codexSections, slackSections } from "./guides/codex-and-slack.js";
import { browserSections } from "./guides/browser.js";
import index from "./tool-index.generated.json" with { type: "json" };
const copy = (en: string, zh: string) => ({ en, zh });
const tools: DocTopic = {
  slug: "tools",
  group: "start",
  title: copy("Tool directory", "全部工具"),
  description: copy(
    "Search every Remote MCP tool, connected App operation and local MCP tool, with permissions and input parameters.",
    "查找全部 Remote MCP 工具、Apps 操作和本地 MCP 工具，查看权限与参数。",
  ),
  sections: [
    {
      heading: copy(
        `${index.remote.length} Remote MCP tools`,
        `${index.remote.length} 个 Remote MCP 工具`,
      ),
      text: copy(
        index.remote.map((tool) => tool.name + " — " + tool.title).join("; "),
        index.remote.map((tool) => tool.name).join(" · "),
      ),
    },
    {
      heading: copy("Connected App operations", "已连接应用的操作"),
      text: copy(
        index.apps.map((app) => app.name + ": " + app.operations.join(", ")).join("; "),
        index.apps.map((app) => app.name + "：" + app.operations.join("、")).join("；"),
      ),
    },
    {
      heading: copy(
        `${index.local.length} local MCP tools`,
        `${index.local.length} 个本地 MCP 工具`,
      ),
      text: copy(
        index.local.map((tool) => tool.name + " (" + tool.modes.join(", ") + ")").join("; "),
        index.local.map((tool) => tool.name + "（" + tool.modes.join("、") + "）").join("；"),
      ),
    },
  ],
  links: [
    ["/docs/connect", "Connect your AI", "连接你的 AI"],
    ["/docs/apps", "App connections", "应用连接"],
    ["/docs/troubleshooting", "Missing tools", "工具不可用时"],
  ],
};
const codex: DocTopic = {
  slug: "codex",
  group: "start",
  title: copy("Connect Codex", "连接 Codex"),
  description: copy(
    "Use Remote Arc from the Codex desktop app, CLI or IDE extension.",
    "从 Codex 桌面应用、CLI 或 IDE 扩展使用 Remote Arc。",
  ),
  sections: codexSections,
  links: [
    [
      "https://learn.chatgpt.com/docs/extend/mcp",
      "Official OpenAI MCP documentation",
      "OpenAI 官方 MCP 文档",
    ],
    ["/docs/tools", "Browse all tools", "浏览全部工具"],
    ["/docs/troubleshooting", "Troubleshooting", "排查问题"],
  ],
};
const slack: DocTopic = {
  slug: "slack",
  group: "work",
  title: copy("Use Arc in Slack", "在 Slack 中使用 Arc"),
  description: copy(
    "Install the Remote Arc bot, link your own account and keep separate tasks in separate Slack threads.",
    "安装 Remote Arc Bot、关联自己的账号，并用独立线程区分不同任务。",
  ),
  sections: slackSections,
  links: [
    [
      "https://agent.remotearc.app/dashboard/connect/apps?provider=slack",
      "Set up Slack",
      "设置 Slack",
    ],
    ["/docs/tools?type=apps&app=slack", "Slack operations", "Slack 操作"],
    ["/docs/usage-and-costs", "Usage and costs", "用量与费用"],
  ],
};
const browser: DocTopic = {
  slug: "browser",
  group: "work",
  title: copy("Browser Runner and the browser extension", "任务浏览器与浏览器扩展"),
  description: copy(
    "Use Browser Runner for delegated website tasks, or the browser extension to work in your own Chrome.",
    "用 Browser Runner 完成委托的网站任务，或用浏览器扩展在你自己的 Chrome 里工作。",
  ),
  sections: browserSections,
  links: [
    ["/docs/tools?group=browser-runner", "Runner tool contracts", "Runner 工具定义"],
    ["/docs/mcp#browser-runner", "Runner setup", "配置 Runner"],
    ["/chrome-extension", "Browser extension", "浏览器扩展"],
    ["/releases", "Agent releases", "Agent 版本发布"],
  ],
};

export function reviewedDocTopics(topics: DocTopic[]): DocTopic[] {
  return topics.flatMap((topic) => {
    const updated = { ...topic };
    if (topic.slug === "connect") {
      updated.legacyIds = ["start", "model"];
      updated.links = [
        ["/docs/tools", "Browse all tools", "浏览全部工具"],
        ["/docs/mcp", "MCP setup and scopes", "MCP 配置与权限"],
      ];
      return [updated, tools, codex];
    }
    if (topic.slug === "browser") return [browser];
    if (topic.slug === "apps") return [updated, slack];
    return [updated];
  });
}
