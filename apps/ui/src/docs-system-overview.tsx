import React from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./docs-system-overview.css";

/**
 * Public "how Remote Arc runs" overview for /docs and /docs/architecture.
 * Mirrors ARCHITECTURE.md at a public level of detail: components, gates and
 * execution paths only. Never add internal costs, provider terms, secret names
 * or abuse thresholds here. `pnpm docs:architecture:check` guards the link.
 */
export function SystemOverview({ guideLink = true }: { guideLink?: boolean }) {
  const { tr, locale } = useI18n();
  const href = (path: string) => localizedWebsiteHref(path, locale);
  const lanes = [
    {
      label: tr("DECIDE", "决策"),
      nodes: [
        [tr("Your AI client", "你的 AI 客户端"), "ChatGPT · Claude · Codex · MCP"],
        [tr("Arc workspace", "Arc 工作空间"), tr("Hosted models, Credits budget", "托管模型 · Credits 预算")],
      ],
    },
    {
      label: tr("CONTROL PLANE", "控制面"),
      nodes: [
        [tr("Sign-in and OAuth", "登录与 OAuth"), tr("Sessions, scoped client grants", "会话 · 按 Scope 授权的客户端")],
        [tr("Plans and policy", "套餐与策略"), tr("Allowances, device ownership, tool policy", "额度 · 设备所有权 · 工具策略")],
        [tr("Tasks and scheduler", "任务与调度"), tr("Stored contracts, leases, revisions", "保存的契约 · 租约 · 版本")],
        [tr("Per-account routing", "按账号路由"), tr("Durable Objects, forwarding only", "Durable Object · 只转发不存储")],
      ],
    },
    {
      label: tr("EXECUTE", "执行"),
      nodes: [
        [tr("Connected Apps", "已连接应用"), tr("Typed operations on your provider accounts", "在你的服务账号上执行类型化操作")],
        [tr("Your computer", "你的电脑"), tr("Go Agent + Execution Core", "Go Agent + Execution Core")],
        [tr("Your browser", "你的浏览器"), tr("Chrome Companion, task browser", "Chrome Companion · 任务浏览器")],
      ],
    },
  ];
  const steps = [
    [tr("Authenticate", "认证"), tr("The AI client calls the MCP endpoint with an OAuth token scoped to the work it may do.", "AI 客户端携带 OAuth 令牌调用 MCP 端点，令牌的 Scope 决定它能做哪类工作。"), "OAuth 2.1 · PKCE"],
    [tr("Authorize", "授权"), tr("The control plane checks the scope, the account's allowance, device ownership and revocation, and the device's saved tool switches.", "控制面检查 Scope、账号额度、设备所有权与撤销状态，以及该设备保存的工具开关。"), tr("scope · plan · device", "Scope · 套餐 · 设备")],
    [tr("Route", "路由"), tr("Your account's Durable Object forwards the call over the connection your computer opened outward. It keeps no copy of the payload.", "账号专属的 Durable Object 通过电脑主动建立的出站连接转发调用，不保存调用内容。"), tr("outbound WSS", "出站 WSS")],
    [tr("Check locally", "本机复核"), tr("The Agent re-checks the permission mode, Trusted Write Locations and sensitive paths. For terminal commands, Safety Guard checks where every delete would land.", "Agent 在本机再次检查权限模式、可信写入区域与敏感路径；终端命令还要经过 Safety Guard 检查每个删除的实际落点。"), tr("paths · Safety Guard", "路径 · Safety Guard")],
    [tr("Execute and record", "执行并记录"), tr("The Execution Core runs the tool and keeps a Local Undo snapshot for supported edits. Usage and activity are recorded.", "Execution Core 执行工具，并为受支持的文件修改保留本机 Undo 快照；用量与活动记录在案。"), tr("Undo · activity", "Undo · 活动记录")],
    [tr("Decide again", "再次决策"), tr("The AI sees the real result and chooses the next step. A lost reply is treated as unknown and inspected, never silently retried.", "AI 看到真实结果再决定下一步。回复丢失时按「结果未知」处理并先检查，绝不静默重试。"), tr("evidence, not assumptions", "以证据为准")],
  ];
  const paths = [
    [tr("Live tool call", "实时工具调用"), tr("Your AI client, turn by turn", "你的 AI 客户端，逐轮决定"), tr("Nothing beyond the result and activity", "结果与活动记录")],
    [tr("Arc run", "Arc 运行"), tr("Arc's hosted model, inside a Credits budget", "Arc 托管模型，在 Credits 预算内"), tr("Encrypted conversation, memory and run history", "加密的对话、记忆与运行记录")],
    [tr("Durable Task", "持久任务"), tr("The approved contract; fresh judgment only where configured", "已批准的契约；仅在配置时引入新的判断"), tr("Contract, schedule, lease and bounded results", "契约、计划、租约与有界结果")],
  ];
  return (
    <section className="systemOverview" id="docs-how-it-runs" aria-labelledby="systemOverviewTitle">
      <header>
        <span className="eyebrow">{tr("HOW REMOTE ARC RUNS", "REMOTE ARC 如何运行")}</span>
        <h2 id="systemOverviewTitle">{tr("From an AI decision to an authorized action.", "从 AI 的决定，到经过授权的操作。")}</h2>
        <p>
          {tr(
            "Remote Arc is not remote-desktop software, and it is more than an MCP server. The model decides what to do; Remote Arc decides whether it may, routes it to the right account or computer, checks it again where it runs, and records what happened.",
            "Remote Arc 不是远程桌面软件，也不只是一个 MCP Server。模型决定要做什么；Remote Arc 判断它能不能做，把操作送到正确的账号或电脑，在执行处再次检查，并记录实际发生了什么。",
          )}
        </p>
      </header>
      <div className="systemLanes" role="list" aria-label={tr("System components", "系统组件")}>
        {lanes.map((lane, index) => (
          <React.Fragment key={lane.label}>
            {index > 0 && <span className="systemLaneArrow" aria-hidden="true">→</span>}
            <div className="systemLane" role="listitem">
              <span>{lane.label}</span>
              {lane.nodes.map(([name, detail]) => (
                <div key={name}><strong>{name}</strong><small>{detail}</small></div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <p className="systemNote">
        {tr(
          "Computers and the browser extension connect outward. There is no inbound port, VPN or desktop stream, and AI clients and computers can each be revoked on their own.",
          "电脑和浏览器扩展都是主动向外连接：没有入站端口、VPN 或桌面串流；AI 客户端和电脑都可以分别撤销。",
        )}
      </p>
      <h3>{tr("The life of one tool call", "一次工具调用的完整过程")}</h3>
      <ol className="systemSteps">
        {steps.map(([title, text, gate], index) => (
          <li key={title}>
            <span className="systemStepIndex">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{title}</strong><p>{text}</p></div>
            <code>{gate}</code>
          </li>
        ))}
      </ol>
      <h3>{tr("Three ways work runs", "三种工作运行方式")}</h3>
      <div className="docsTableWrap">
        <table className="articleTable">
          <thead><tr><th>{tr("Path", "方式")}</th><th>{tr("Who decides", "由谁决策")}</th><th>{tr("What persists", "保存什么")}</th></tr></thead>
          <tbody>{paths.map(([path, who, kept]) => <tr key={path}><td>{path}</td><td>{who}</td><td>{kept}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="systemNote">
        {tr(
          "All three paths pass the same authorization and local checks. None of them is an operating-system sandbox: commands that are allowed run as your OS user.",
          "三种方式都经过同样的授权与本机检查。但它们都不是操作系统沙箱：被允许的命令以你的 OS 用户身份运行。",
        )}
      </p>
      <nav className="systemLinks" aria-label={tr("Architecture references", "架构参考")}>
        {guideLink && <a href={href("/docs/architecture")}>{tr("Architecture deep dive", "架构技术详解")} →</a>}
        <a href={href("/security-model")}>{tr("Security model", "安全模型")} →</a>
        <a href={href("/docs/tools")}>{tr("All tools", "全部工具")} →</a>
      </nav>
    </section>
  );
}
