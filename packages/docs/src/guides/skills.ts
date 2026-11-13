import type { DocSection } from "../catalog.js";

export const skillsSections: DocSection[] = [
  {
    heading: { en: "What a Skill is", zh: "技能是什么" },
    text: {
      en: "A Skill is a written method for producing one kind of result, such as a website preview, a source-based report or a deployment check. It tells the AI which steps to take and how to check the outcome, using the Apps and computers you have already connected.",
      zh: "技能是产出某一类结果的书面方法，例如网站预览、基于来源的报告或部署检查。它告诉 AI 用你已连接的应用和电脑，按什么步骤做、怎样检查结果。",
    },
    paragraphs: [
      {
        en: "A Skill is guidance, not a capability. It does not install software, create provider accounts or change device permissions, and it never grants access the AI did not already have.",
        zh: "技能是指引，不是能力。它不会安装软件、创建服务商账号或修改设备权限，也不会给 AI 增加它原本没有的访问权限。",
      },
    ],
  },
  {
    heading: { en: "Use a Skill in Arc", zh: "在 Arc 中使用技能" },
    text: {
      en: "The Skills library includes workflows for a real website preview, a saved source-based report, reading inbox excerpts, creating and reading back a GitHub issue, and checking a deployment.",
      zh: "技能库包含以下工作流：生成真实的网站预览、保存基于源文件的报告、读取邮件摘录、创建并回读 GitHub Issue、核对部署状态。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Connect the Apps or computer the workflow needs first.",
          zh: "先连接这个工作流需要的应用或电脑。",
        },
        {
          en: "Open a workflow from the library, or type @ in Chat. You can attach up to three Skills and five active App accounts to one message as badges.",
          zh: "从技能库打开工作流，或在 Chat 中输入 @。一条消息最多可以附加三个技能和五个已连接的应用账号（以 badge 形式）。",
        },
        {
          en: "Describe your goal. The references are saved separately from your text, and no internal prompt is pasted into the message.",
          zh: "描述你的目标。引用与正文分开保存，不会把内部提示词粘贴进消息。",
        },
      ],
    },
  },
  {
    heading: { en: "Import your own Skill", zh: "导入自己的技能" },
    text: {
      en: "You can import a SKILL.md, optionally with a link to where it came from. The link records attribution only: files the Skill refers to in its repository are not downloaded.",
      zh: "可以导入 SKILL.md，并可附上来源链接。链接只用于记录出处，技能在仓库中引用的其他文件不会被下载。",
    },
    paragraphs: [
      {
        en: "Before starting, check that every App, device and tool the Skill expects is available. If one is missing, set it up first; the Skill on its own cannot perform the action.",
        zh: "开始前，确认技能需要的应用、设备和工具都可用。缺少哪一项就先配置哪一项，仅有技能本身无法执行操作。",
      },
    ],
  },
  {
    heading: { en: "Skills through Connect", zh: "通过 Connect 使用技能" },
    text: {
      en: "AI clients connected through MCP can search and read the same catalog with the find_skills and read_skill tools. The AI reads the relevant Skill, then finds the specific App or device action it needs.",
      zh: "通过 MCP 连接的 AI 客户端，可以用 find_skills 和 read_skill 工具搜索和读取同一个技能目录。AI 先读取相关技能，再查找所需的具体应用或设备操作。",
    },
    paragraphs: [
      {
        en: "App actions still run only within the scopes the provider granted, and device actions still follow that computer’s local policy. A Skill that describes a generation engine does not mean the engine is installed.",
        zh: "应用操作仍只在服务商授予的范围内执行，设备操作仍遵循该电脑的本地策略。技能里描述了某个生成引擎，不代表这个引擎已经安装。",
      },
    ],
  },
];
