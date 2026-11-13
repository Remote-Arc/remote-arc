import { reviewedDocTopics } from "./documentation-review.js";
import { installAppSections } from "./guides/install-app.js";
import { deviceFleetSections } from "./guides/device-fleet.js";
import { appsSections } from "./guides/apps.js";
import { tasksSections } from "./guides/tasks.js";
import { skillsSections } from "./guides/skills.js";
import { arcSections } from "./guides/arc.js";
import { usageAndCostsSections } from "./guides/usage-and-costs.js";
import { platformDocTopics } from "./platform-docs.js";
import { REFERENCE_TOPICS } from "./reference-docs.js";
export type DocCopy = { en: string; zh: string };
/**
 * One heading of a documentation article. `text` is the opening paragraph;
 * `list` follows it (numbered when `ordered`), then any further `paragraphs`.
 * `note` renders last as a short callout for limits or caveats.
 */
export type DocSection = {
  heading: DocCopy;
  text: DocCopy;
  list?: { ordered?: boolean; items: DocCopy[] };
  paragraphs?: DocCopy[];
  note?: DocCopy;
};
export type DocTopic = {
  slug: string;
  group: "start" | "work" | "understand" | "reference";
  reference?: { en: string; zh?: string };
  listed?: boolean;
  title: DocCopy;
  description: DocCopy;
  legacyIds?: string[];
  sections?: DocSection[];
  links?: string[][];
};
/** Plain text of a whole section, for search engines and checks. */
export function docSectionText(section: DocSection, language: keyof DocCopy): string {
  return [
    section.text,
    ...(section.list?.items || []),
    ...(section.paragraphs || []),
    ...(section.note ? [section.note] : []),
  ]
    .map((copy) => copy[language])
    .join(" ");
}
export const DOC_TOPICS: DocTopic[] = [
  ...reviewedDocTopics(
    platformDocTopics([
      {
        slug: "install-app",
        group: "start",
        title: { en: "Install the web app", zh: "安装网页应用" },
        description: {
          en: "Keep your Remote Arc workspace in a dedicated window on your desktop or phone.",
          zh: "在电脑或手机上，将 Remote Arc 工作空间安装为独立应用。",
        },
        sections: installAppSections,
      },
      {
        slug: "connect",
        group: "start",
        title: {
          en: "Connect your AI",
          zh: "连接你的 AI",
        },
        description: {
          en: "Set up Remote MCP, pair a computer and choose the AI chat you use.",
          zh: "配置 Remote MCP、配对电脑，使用你熟悉的 AI 聊天。",
        },
        legacyIds: ["start", "model", "tools"],
      },
      {
        slug: "devices",
        group: "start",
        title: {
          en: "Devices and permissions",
          zh: "设备与权限",
        },
        description: {
          en: "Manage Windows, macOS and Linux computers, trusted locations and background access.",
          zh: "管理 Windows、macOS、Linux 设备、可信目录和后台连接。",
        },
        legacyIds: ["policy"],
      },
      {
        slug: "device-fleet",
        group: "work",
        title: {
          en: "Intelligent device fleet",
          zh: "智能设备调度",
        },
        description: {
          en: "Match work to the right computer using permissions, capabilities and current load.",
          zh: "依据权限、能力和当前负载，为工作匹配合适的电脑。",
        },
        sections: deviceFleetSections,
        links: [
          ["/docs/devices", "Device setup", "设备配置"],
          ["/docs/tasks", "Tasks and routines", "任务与 Routine"],
        ],
      },
      {
        slug: "apps",
        group: "work",
        title: {
          en: "Apps and account connections",
          zh: "Apps 与账号连接",
        },
        description: {
          en: "Connect once, then use the available tools from your AI.",
          zh: "连接一次，在 AI 中使用账号已授权的工具。",
        },
        sections: appsSections,
        links: [
          ["/integrations", "Explore Apps", "查看应用目录"],
          ["/docs/usage-and-costs", "Usage and costs", "用量与费用"],
        ],
      },
      {
        slug: "files",
        group: "work",
        title: {
          en: "Files and Undo",
          zh: "文件与撤销",
        },
        description: {
          en: "Read, edit and share bounded file results with local Undo and revision checks.",
          zh: "读取、编辑和分享文件结果，使用本地撤销与版本校验。",
        },
        legacyIds: ["files"],
      },
      {
        slug: "processes",
        group: "work",
        title: {
          en: "Commands and recovery",
          zh: "命令与恢复",
        },
        description: {
          en: "Start approved processes, collect output and inspect background recovery.",
          zh: "执行已授权命令、读取输出，了解后台恢复。",
        },
        legacyIds: ["processes"],
      },
      {
        slug: "browser",
        group: "work",
        title: {
          en: "Browser tabs",
          zh: "浏览器标签页",
        },
        description: {
          en: "Let the AI work on sites you allow in your browser, or share a single tab read-only.",
          zh: "让 AI 在你允许的网站上操作你的浏览器，或只读共享单个标签页。",
        },
        legacyIds: ["browser"],
      },
      {
        slug: "tasks",
        group: "work",
        title: {
          en: "Tasks and Routines",
          zh: "任务与 Routines",
        },
        description: {
          en: "One-off tasks and repeating routines, created and managed through conversation.",
          zh: "通过对话创建和管理一次性任务与重复 Routine。",
        },
        links: [["/docs/long-running-work", "Long-running work guide", "持续工作指南"]],
        sections: tasksSections,
      },
      {
        slug: "skills",
        group: "understand",
        title: {
          en: "Skills",
          zh: "技能",
        },
        description: {
          en: "Use reusable cloud-hosted guidance with the execution tools you have authorized.",
          zh: "在已授权的执行工具上，使用可复用的云端技能指引。",
        },
        sections: skillsSections,
      },
      {
        slug: "arc",
        group: "understand",
        title: {
          en: "Arc and AI agents",
          zh: "Arc 与 AI 智能体",
        },
        description: {
          en: "Use Arc, your hosted personal agent for apps, computers and persistent work.",
          zh: "使用 Arc：连接应用、电脑和持续工作的托管个人 Agent。",
        },
        sections: arcSections,
        links: [
          ["/arc", "Explore Arc", "了解 Arc"],
          ["/docs/slack", "Use Arc in Slack", "在 Slack 中使用 Arc"],
          ["/roadmap", "Product roadmap", "产品路线图"],
        ],
      },
      {
        slug: "usage-and-costs",
        group: "understand",
        title: {
          en: "Usage and costs",
          zh: "用量与费用",
        },
        description: {
          en: "Understand your Remote Arc allowance and any separate app charges.",
          zh: "了解 Remote Arc 额度，以及应用可能产生的独立费用。",
        },
        sections: usageAndCostsSections,
        links: [
          [
            "https://docs.dev.runwayml.com/guides/pricing/",
            "Runway API pricing",
            "Runway API 计费",
          ],
          [
            "https://developers.google.com/workspace/tools-safety",
            "Google Workspace quotas",
            "Google Workspace 额度规则",
          ],
          ["/pricing", "Remote Arc plans", "Remote Arc 套餐"],
        ],
      },
      {
        slug: "security",
        group: "understand",
        title: {
          en: "Security and data handling",
          zh: "安全与数据处理",
        },
        description: {
          en: "Understand execution boundaries, stored data, permissions and revocation.",
          zh: "了解执行边界、数据存储、权限和撤销。",
        },
        legacyIds: ["sandbox", "data"],
        links: [["/security-model", "Security model", "安全模型"]],
      },
      {
        slug: "architecture",
        group: "understand",
        title: {
          en: "Architecture",
          zh: "系统架构",
        },
        description: {
          en: "Follow a request through MCP, the cloud relay and the local execution core.",
          zh: "了解请求如何经过 MCP、云端 Relay 和本地执行核心。",
        },
        legacyIds: [
          "routing",
          "architecture-deep",
          "architecture-trust",
          "architecture-task",
          "architecture-persistence",
          "architecture-data",
          "architecture-limits",
        ],
      },
      {
        slug: "troubleshooting",
        group: "start",
        title: {
          en: "Troubleshooting",
          zh: "排查问题",
        },
        description: {
          en: "Resolve device, browser, authorization and availability problems.",
          zh: "排查设备、浏览器、授权及功能可用性问题。",
        },
        legacyIds: ["troubleshoot", "limits"],
      },
      {
        slug: "reference",
        group: "understand",
        title: {
          en: "Complete reference",
          zh: "完整参考",
        },
        description: {
          en: "Read the original detailed product guide in one place.",
          zh: "在同一页面查看完整的产品操作参考。",
        },
      },
    ]),
  ),
  ...REFERENCE_TOPICS,
];
export const DOC_PATHS = DOC_TOPICS.map((topic) => "/docs/" + topic.slug);
export const docTopic = (path: string) =>
  DOC_TOPICS.find((topic) => "/docs/" + topic.slug === path);
