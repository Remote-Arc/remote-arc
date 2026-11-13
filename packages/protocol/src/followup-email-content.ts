import { FOLLOWUP_UPGRADE_URL } from "./followup-templates.js";
import {
  AGENT_INSTALL_COMMANDS,
  EMAIL_AI_CLIENTS,
  EMAIL_ART_ORIGIN,
  type EmailStep,
} from "./email-layout.js";

/** What a follow-up template shows around the admin's message, in the same
 * shape as the automated emails: a header with artwork, optional steps, and a
 * button to the one next action. Admins can still override the eyebrow,
 * headline, intro and button label per email. */
export type FollowupPresentation = {
  eyebrow: string;
  headline: string;
  intro: string;
  /** Artwork file in apps/ui/public/email-art. */
  hero: string;
  /** Small heading above the steps. */
  stepsLabel?: string;
  steps: EmailStep[];
  cta: { href: string; label: string };
  /** Asks for feedback, so a feedback reward note fits. */
  asksForFeedback: boolean;
};

const art = (name: string) => EMAIL_ART_ORIGIN + name;

export function followupPresentation(
  templateId: string,
  locale: "en" | "zh",
  links: { setupUrl: string; feedbackUrl: string },
): FollowupPresentation {
  const zh = locale === "zh",
    tr = (en: string, cn: string) => (zh ? cn : en);
  // Website pages in the email's language: every page linked here has a /zh version.
  const page = (path: string) => new URL((zh ? "/zh" : "") + path, links.setupUrl).href;
  const setup = { href: links.setupUrl, label: tr("Open the setup guide", "查看开始指南") };
  const feedback = (en: string, cn: string, rest: Partial<FollowupPresentation>) => ({
    hero: "followup-hero.png",
    steps: [],
    cta: { href: links.feedbackUrl, label: tr(en, cn) },
    asksForFeedback: true,
    eyebrow: "",
    headline: "",
    intro: "",
    ...rest,
  });
  const connectStep: EmailStep = {
    title: tr("Connect your AI", "连接你的 AI"),
    body: tr(
      "Pick the AI you use to open its step-by-step setup guide.",
      "选择你在用的 AI，打开对应的分步设置教程。",
    ),
    icon: art("icon-connect.png"),
    logos: EMAIL_AI_CLIENTS.map((client) => ({
      label: client.name,
      href: page("/install/" + client.slug),
      src: art("client-" + client.slug + ".png"),
    })),
    link: { label: tr("All setup guides", "查看全部设置教程"), href: page("/connect-ai") },
  };

  switch (templateId) {
    case "pair-computer":
      return {
        eyebrow: tr("Next step", "下一步"),
        headline: tr("Pair your computer to get started", "配对电脑，就可以开始了"),
        intro: tr(
          "One command installs the Agent, then your AI can work on this computer.",
          "一条命令安装 Agent，你的 AI 就能在这台电脑上干活。",
        ),
        hero: "welcome-hero.png",
        stepsLabel: tr("Two steps left", "还差两步"),
        steps: [
          {
            title: tr("Install the Agent on your computer", "在电脑上安装 Agent"),
            body: tr(
              "Run one command in a terminal. It starts the Agent; then approve the pairing in your account.",
              "在终端运行一条命令，会启动 Agent，然后在账号中确认配对。",
            ),
            icon: art("icon-computer.png"),
            commands: [
              {
                label: tr("Any computer with Node.js", "已安装 Node.js 的电脑"),
                command: AGENT_INSTALL_COMMANDS.npx,
              },
              {
                label: tr("macOS / Linux, no Node.js", "macOS / Linux，无需 Node.js"),
                command: AGENT_INSTALL_COMMANDS.script,
              },
            ],
            link: {
              label: tr(
                "Or download it for macOS, Windows or Linux",
                "也可以下载 macOS、Windows 或 Linux 版",
              ),
              href: page("/downloads"),
            },
          },
          connectStep,
        ],
        cta: { href: page("/downloads"), label: tr("Install the Agent", "安装 Agent") },
        asksForFeedback: false,
      };
    case "finish-mcp":
      return {
        eyebrow: tr("Computer paired", "电脑已配对"),
        headline: tr(
          "Your computer is ready. Connect your AI next",
          "电脑已就绪，下一步连接你的 AI",
        ),
        intro: tr(
          "Add Remote Arc to the AI you use and sign in. There is no need to pair again.",
          "在你常用的 AI 里添加 Remote Arc 并登录，无需再次配对。",
        ),
        hero: "welcome-hero.png",
        stepsLabel: tr("One step left", "只差一步"),
        steps: [
          {
            title: tr("Your computer is paired", "电脑已配对"),
            body: tr(
              "The Agent is installed and linked to your account.",
              "Agent 已安装并关联到你的账号。",
            ),
            icon: art("icon-done.png"),
          },
          connectStep,
        ],
        cta: { href: page("/connect-ai"), label: tr("Connect your AI", "连接你的 AI") },
        asksForFeedback: false,
      };
    case "first-connection":
      return {
        eyebrow: tr("Getting started", "开始使用"),
        headline: tr("Start with one useful result", "从一个有用的结果开始"),
        intro: tr(
          "Give Arc a goal directly, or connect the AI you already use.",
          "直接把目标交给 Arc，或连接你已经在用的 AI。",
        ),
        hero: "welcome-hero.png",
        steps: [],
        cta: setup,
        asksForFeedback: false,
      };
    case "first-result":
      return {
        eyebrow: tr("First result", "第一个结果"),
        headline: tr("Try a result you can check", "试一个能检查的结果"),
        intro: tr(
          "Each of these shows Remote Arc working from start to finish.",
          "每一个都能完整体验 Remote Arc 从开始到完成的工作方式。",
        ),
        hero: "welcome-hero.png",
        stepsLabel: tr("Ideas to try", "可以先试试"),
        steps: [
          {
            title: tr("Summarize your inbox", "整理最近邮件"),
            body: tr(
              "Ask Arc to sort and summarize recent email.",
              "让 Arc 归类并总结最近的邮件。",
            ),
          },
          {
            title: tr("Make a report from a folder", "根据目录生成报告"),
            body: tr(
              "Choose a folder and get a saved report you can open.",
              "指定一个目录，得到一份可以打开的报告。",
            ),
          },
          {
            title: tr("Build a website", "做一个网站"),
            body: tr(
              "Get a working preview you can click through.",
              "得到一个可以点开预览的网站。",
            ),
          },
        ],
        cta: setup,
        asksForFeedback: false,
      };
    case "quota-upgrade":
      return {
        eyebrow: tr("Monthly allowance", "每月额度"),
        headline: tr("Need more calls this month?", "本月需要更多调用吗？"),
        intro: tr(
          "Upgrade to keep going, or wait for your allowance to reset.",
          "可以升级继续使用，也可以等待额度重置。",
        ),
        hero: "trial-ending-hero.png",
        steps: [],
        cta: { href: FOLLOWUP_UPGRADE_URL, label: tr("Review upgrade options", "查看升级方案") },
        asksForFeedback: false,
      };
    case "remote-computer":
      return {
        eyebrow: tr("Your machines", "你的机器"),
        headline: tr(
          "Manage your Linux box or Mac mini from your AI",
          "在 AI 里管理你的 Linux 主机或 Mac mini",
        ),
        intro: tr(
          "Commands, logs, long jobs and browser tasks. No public IP or port forwarding.",
          "命令、日志、耗时任务和网页任务，不需要公网 IP 或端口映射。",
        ),
        hero: "welcome-hero.png",
        stepsLabel: tr("Things to ask for", "可以这样用"),
        steps: [
          {
            title: tr("Run commands", "运行命令"),
            body: tr(
              "“On my Mac mini, check disk usage and show what takes the most space.”",
              "“在我的 Mac mini 上检查磁盘占用，列出最占空间的内容。”",
            ),
            link: {
              label: tr("Install the Agent on that machine", "在那台机器上安装 Agent"),
              href: page("/downloads"),
            },
          },
          {
            title: tr("Check services and logs", "检查服务和日志"),
            body: tr(
              "“On my home server, check whether nginx is running and show today’s errors.”",
              "“在家里的服务器上看看 nginx 是否在运行，列出今天的错误日志。”",
            ),
          },
          {
            title: tr("Keep long jobs going", "让耗时任务跑完"),
            body: tr(
              "“Start the backup script and tell me how it went when it finishes.”",
              "“启动备份脚本，跑完后告诉我结果。”",
            ),
          },
          {
            title: tr("Do browser tasks", "完成网页任务"),
            body: tr(
              "“Open our dashboard in the browser and download this month’s report.”",
              "“在浏览器里打开我们的后台，下载本月报表。”",
            ),
          },
        ],
        cta: { href: page("/use-cases/home-lab"), label: tr("See how it works", "看看怎么用") },
        asksForFeedback: false,
      };
    case "coding-agent":
      return {
        eyebrow: tr("Coding", "写代码"),
        headline: tr("Keep building on your own computer", "在自己的电脑上接着写代码"),
        intro: tr(
          "Prototypes, fixes, and the tasks Codex or Claude Code left unfinished.",
          "做原型、修问题，接着完成 Codex 或 Claude Code 没做完的任务。",
        ),
        hero: "coding-hero.png",
        stepsLabel: tr("Things to ask for", "可以这样用"),
        steps: [
          {
            title: tr("Build a prototype", "做一个原型"),
            body: tr(
              "“In ~/projects, create a prototype of a booking page and start it so I can open it.”",
              "“在 ~/projects 里做一个预约页面的原型，并启动起来让我打开看看。”",
            ),
          },
          {
            title: tr("Fix and test", "修复并测试"),
            body: tr(
              "“In my checkout, find out why the tests fail, fix it and run them again.”",
              "“在我的代码目录里找出测试失败的原因，修好后再跑一遍。”",
            ),
          },
          {
            title: tr("Continue an unfinished task", "接着做没完成的任务"),
            body: tr(
              "“List my Codex and Claude Code sessions, find the one on the checkout branch and finish it in its worktree.” Your AI sees each session’s worktree, branch and uncommitted changes (Agent 0.6.4 or later).",
              "“列出我的 Codex 和 Claude Code 会话，找到 checkout 分支上的那个，在它的工作树里接着完成。”AI 能看到每个会话的工作树、分支和未提交的改动（需要 Agent 0.6.4 或更高版本）。",
            ),
          },
        ],
        cta: {
          href: page("/use-cases/remote-development"),
          label: tr("See how coding works", "看看怎么写代码"),
        },
        asksForFeedback: false,
      };
    case "support-check":
      return feedback("Send us an update", "告诉我们最新情况", {
        eyebrow: tr("Support follow-up", "问题跟进"),
        headline: tr("Is everything working now?", "现在一切正常了吗？"),
        intro: tr("Following up on the issue you reported.", "跟进一下你之前反馈的问题。"),
      });
    case "workflow-help":
      return feedback("Share your idea", "写下你的想法", {
        eyebrow: tr("Your workflow", "你的工作场景"),
        headline: tr("What would you hand off to your AI?", "你想把什么交给 AI？"),
        intro: tr(
          "Tell us one task, and we will help you see whether Remote Arc fits.",
          "告诉我们一件事，我们帮你判断 Remote Arc 是否合适。",
        ),
      });
    case "use-case":
      return feedback("Share your use case", "分享使用场景", {
        eyebrow: tr("Your use case", "使用场景"),
        headline: tr("What do you use Remote Arc for?", "你平时用 Remote Arc 做什么？"),
        intro: tr(
          "A sentence or two about a recent task is enough.",
          "一两句话介绍最近的一个任务就够了。",
        ),
      });
    default:
      // "experience", and any template added without its own presentation.
      return feedback("Share your feedback", "填写体验反馈", {
        eyebrow: tr("Quick question", "想听听你的体验"),
        headline: tr("How has Remote Arc been working for you?", "Remote Arc 用起来怎么样？"),
        intro: tr(
          "A few minutes of feedback helps us decide what to improve next.",
          "花几分钟告诉我们，帮我们决定下一步改进什么。",
        ),
      });
  }
}
