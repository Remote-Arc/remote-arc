import type { DocCopy, DocTopic } from "./catalog.js";

/** Repository documents published on the website. The site never links to them
 * on GitHub. Only list documents reviewed for public reading: no internal
 * process notes, operating budgets, secret names or abuse thresholds. */
type ReferenceSource = { en: string; zh?: string };
const copy = (en: string, zh: string): DocCopy => ({ en, zh });
const reference = (slug: string, source: ReferenceSource, title: DocCopy, description: DocCopy, listed = true): DocTopic => ({
  slug, group: "reference", title, description, reference: source, listed,
});
const featureMap = (name: string, title: DocCopy) => reference(
  "feature-map-" + name,
  { en: "docs/feature-map/" + name + ".md" },
  title,
  copy("Entry points, permissions, evidence and regression paths for this feature.", "这项功能的入口、权限、证据与回归路径。"),
  false,
);

export const REFERENCE_TOPICS: DocTopic[] = [
  reference("engineering-architecture", { en: "docs/agent-platform-architecture.md" },
    copy("Engineering architecture", "工程架构"),
    copy("The execution contract behind Arc and Connect: run state, context, security boundaries, memory and scheduling.", "Arc 与 Connect 背后的执行契约：运行状态、上下文、安全边界、记忆与调度。")),
  reference("execution-isolation", { en: "docs/execution-isolation.en.md", zh: "docs/execution-isolation.md" },
    copy("Execution isolation", "执行隔离"),
    copy("What local execution protects today, what it does not, and how optional isolation could work.", "本机执行目前保护什么、不保护什么，以及可选隔离的设计方向。")),
  reference("security-policy", { en: "SECURITY.md" },
    copy("Security policy", "安全策略"),
    copy("Trust boundaries, credential handling, local permissions and durable work security.", "信任边界、凭证处理、本地权限与持久工作的安全设计。")),
  reference("feature-map", { en: "docs/feature-map/README.md" },
    copy("Feature map", "功能地图"),
    copy("How each verified feature is reached, what it proves and how it is tested.", "每项已验证功能的入口、证明内容与测试方式。")),
  featureMap("verified-inbox", copy("Feature map: inbox excerpts", "功能地图：收件箱摘录")),
  featureMap("verified-issue", copy("Feature map: GitHub issue", "功能地图：GitHub Issue")),
  featureMap("verified-deployment", copy("Feature map: deployment readiness", "功能地图：部署就绪")),
  featureMap("website-delivery", copy("Feature map: website delivery", "功能地图：网站交付")),
  featureMap("cross-cutting-flows", copy("Feature map: cross-cutting flows", "功能地图：通用流程")),
  featureMap("native-billing", copy("Feature map: billing", "功能地图：计费")),
  featureMap("ai-teams", copy("Feature map: AI Teams", "功能地图：AI 团队")),
  reference("benchmarks", { en: "benchmarks/README.md" },
    copy("Benchmarks", "性能基准"),
    copy("How the Go and TypeScript runtime benchmarks were run, with reproduction steps and artifact hashes.", "Go 与 TypeScript 运行时基准的运行方式、复现步骤和产物哈希。")),
  reference("benchmark-baseline", { en: "benchmarks/RESULTS-2026-10-09-f68ab09.md" },
    copy("Benchmark: Mac and Windows baseline", "基准：Mac 与 Windows 基线"),
    copy("Measured results for commit f68ab09.", "提交 f68ab09 的实测结果。"), false),
  reference("benchmark-windows-followup", { en: "benchmarks/RESULTS-2026-10-09-71cde96.md" },
    copy("Benchmark: Windows path follow-up", "基准：Windows 路径修复"),
    copy("Measured results for commit 71cde96.", "提交 71cde96 的实测结果。"), false),
];

const sourcePaths = (topic: DocTopic) => [topic.reference?.en, topic.reference?.zh].filter((path): path is string => Boolean(path));

/** Maps a link inside a hosted document. Returns a site path, an unchanged web
 * link, or null for repository files that are not published. */
export function referenceLink(source: string, href: string) {
  if (/^(?:https?:|mailto:|#)/.test(href)) return href;
  const [path, fragment] = href.split("#");
  const parts = source.split("/").slice(0, -1);
  for (const part of path!.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  const target = parts.join("/");
  const topic = REFERENCE_TOPICS.find((item) => sourcePaths(item).includes(target));
  return topic ? "/docs/" + topic.slug + (fragment ? "#" + fragment : "") : null;
}
