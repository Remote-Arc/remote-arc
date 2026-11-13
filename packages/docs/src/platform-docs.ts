import type { DocTopic } from "./catalog.js";
import { startHereSections } from "./guides/start-here.js";
import { architectureSections } from "./guides/architecture.js";
import { trustSections } from "./guides/trust.js";
import { memorySections } from "./guides/memory.js";

const overview: DocTopic = {
  slug: "start-here",
  group: "start",
  title: { en: "How Remote Arc gets work done", zh: "Remote Arc 如何完成工作" },
  description: {
    en: "Start with an outcome. Connect your tools, reuse a skill and keep the result with the work.",
    zh: "从目标出发，连接工具、复用技能，让结果随工作保留。",
  },
  sections: startHereSections,
  links: [
    ["/docs/arc", "Arc workspace", "Arc 工作空间"],
    ["/docs/apps", "Connect Apps", "连接 Apps"],
    ["/docs/tasks", "Tasks and routines", "任务与 Routine"],
    ["/docs/architecture", "Technical architecture", "技术架构"],
    ["/docs/trust", "Verified results", "结果核验"],
  ],
};

const architecture: DocTopic = {
  slug: "architecture",
  group: "understand",
  title: { en: "Platform architecture", zh: "平台技术架构" },
  description: {
    en: "How models, the Arc runtime, Apps, persistent tasks and device execution cooperate.",
    zh: "模型、Arc 运行时、Apps、持久任务和设备执行如何协作。",
  },
  sections: architectureSections,
  links: [
    ["/docs/start-here", "User guide", "用户指南"],
    ["/docs/security", "Security controls", "安全控制"],
    ["/docs/engineering-architecture", "Engineering reference", "工程参考"],
  ],
};

const trust: DocTopic = {
  slug: "trust",
  group: "understand",
  title: {
    en: "Verified results and execution receipts",
    zh: "结果核验与执行回执",
  },
  description: {
    en: "Choose exact checks, keep execution within scope and inspect the evidence.",
    zh: "先选定检查，限定执行范围，再查看结果证据。",
  },
  sections: trustSections,
  links: [
    ["/docs/skills", "Reusable handbooks", "可复用任务手册"],
    ["/docs/architecture", "Technical architecture", "技术架构"],
    ["/docs/feature-map", "Feature map and regressions", "功能地图与回归路径"],
  ],
};
const memory: DocTopic = {
  slug: "memory",
  group: "understand",
  title: { en: "Context and memory", zh: "上下文与记忆" },
  description: {
    en: "What Arc remembers, where it is stored and how you control it.",
    zh: "Arc 记住什么、保存在哪里，以及你如何控制。",
  },
  sections: memorySections,
  links: [
    ["/docs/architecture", "Platform architecture", "平台架构"],
    ["/privacy", "Privacy policy", "隐私政策"],
  ],
};

export function platformDocTopics(existing: DocTopic[]): DocTopic[] {
  return [
    overview,
    ...existing.map((topic) => (topic.slug === "architecture" ? architecture : topic)),
    trust,
    memory,
  ];
}
