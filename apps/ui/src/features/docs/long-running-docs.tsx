import React from "react";
import { useI18n } from "../../app/i18n.js";
import { TaskAvailability } from "./product-docs.js";

export function LongRunningWorkDocs() {
  const { tr } = useI18n();
  return (
    <main className="technicalDoc productDocs">
      <header className="articleHeader">
        <span className="eyebrow">{tr("DOCUMENTATION · DURABLE TASKS", "文档 · 持久任务")}</span>
        <h1>{tr("Tasks, routines and long-running work", "Task、Routine 与持续工作")}</h1>
        <p>{tr(
          "Arc Tasks and Routines run bounded hosted AI work using saved instructions, even when the chat tab is closed. Connect Tasks separately persist approved commands, schedules and event conditions. Choose the mode that matches whether the work needs fresh AI judgment or a fixed execution contract.",
          "Arc Task 与 Routine 按保存的指令执行有界的托管 AI 工作，无需一直打开聊天标签页。Connect Task 则持久保存已授权的命令、定时与事件条件。根据工作是否需要新的 AI 判断，选择托管工作或固定执行契约。",
        )}</p>
        <div className="articleMetaLinks">
          <a href="/docs">{tr("All documentation", "全部文档")} →</a>
          <a href="/security-model">{tr("Security model", "安全模型")} →</a>
          <a href="/use-cases">{tr("Use cases", "使用场景")} →</a>
        </div>
      </header>
      <TaskAvailability />
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("CONTENTS", "目录")}</strong>
          {[
            ["boundary", tr("What persists", "哪些能力会持续")],
            ["modes", tr("Supported task modes", "支持的任务模式")],
            ["limits", tr("Where AI reasoning stops", "AI 推理的边界")],
            ["recovery", tr("Reconnect and recovery", "重连与恢复")],
            ["security", tr("Permissions", "权限")],
          ].map(([id, title]) => <a key={id} href={"#work-" + id}>{title}</a>)}
        </aside>
        <article className="technicalArticle">
          <section id="work-boundary">
            <h2>{tr("Choose Arc or Connect for saved work", "选择 Arc 或 Connect 保存工作")}</h2>
            <p>{tr(
              "A chat can authorize and save work that is already concrete: a command, working directory, schedule, event condition, retry bound and verification command. Remote Arc persists that contract and its run state independently of the original chat.",
              "聊天可以授权并保存已经明确的工作：命令、工作目录、时间计划、事件条件、重试边界和验收命令。Remote Arc 独立于原聊天持久保存这份任务契约和运行状态。",
            )}</p>
            <p>{tr(
              "Arc starts a bounded hosted model run for a saved Task or Routine, subject to Credits, time and step limits. Connect can continue a known execution contract after an external chat turn ends, but cannot guarantee that the external AI client will start a fresh reasoning turn. A new strategy needs an active compatible host or a separately configured goal continuation contract.",
              "Arc 为保存的 Task 或 Routine 启动有界托管模型运行，遵循 Credits、时间与步数限制。Connect 可以在外部聊天轮次结束后继续已有执行契约，但不保证外部 AI 客户端主动开始新一轮推理。新策略仍需兼容且可用的宿主，或单独配置目标续跑契约。",
            )}</p>
          </section>

          <section id="work-modes">
            <h2>{tr("Connect task modes", "Connect 任务模式")}</h2>
            <div className="tableScroll"><table><thead><tr><th>{tr("Mode", "模式")}</th><th>{tr("What persists", "持久内容")}</th></tr></thead><tbody>
              <tr><td>{tr("Long task", "长任务")}</td><td>{tr("Start and track one approved command after the creating chat turn ends.", "聊天结束后启动并跟踪一个已批准命令。")}</td></tr>
              <tr><td>{tr("Scheduled task", "定时任务")}</td><td>{tr("Run approved deterministic work at a future time or completion-based interval.", "在未来时间或按完成间隔执行已批准的确定性工作。")}</td></tr>
              <tr><td>{tr("Condition watch", "条件监听")}</td><td>{tr("Wait for a configured event and then execute the approved action.", "等待已配置事件后执行已批准操作。")}</td></tr>
              <tr><td>{tr("Verification loop", "验收循环")}</td><td>{tr("Repeat the same bounded work plan and verification command until success or a saved stop condition.", "重复同一套有界工作计划与验收命令，直到成功或触发保存的停止条件。")}</td></tr>
            </tbody></table></div>
          </section>

          <section id="work-limits">
            <h2>{tr("When fresh judgment is needed", "需要新判断时怎么办")}</h2>
            <p>{tr(
              "A deterministic task can wait for processes and events without spending model reasoning. But a failed test that needs a new diagnosis, an unexpected repository state, or a choice between new strategies requires an active AI host or the user to resume the work.",
              "确定性 Task 可以在不持续占用模型推理的情况下等待进程和事件。但如果测试失败需要重新诊断、仓库出现意外状态，或需要在新策略之间做选择，就必须由可用的 AI 宿主或用户重新接手。",
            )}</p>
            <p>{tr(
              "Experimental source-goal and hosted-goal tools appear only where those capabilities are enabled. They use explicit continuation contracts and still require an available reasoning host. Arc Tasks and Routines use a separate bounded hosted runtime.",
              "Source Goal 与托管目标工具只在相应实验能力开启时提供，使用明确的续跑契约，仍需可用推理宿主。Arc Task 与 Routine 则使用独立的有界托管运行时。",
            )}</p>
          </section>

          <section id="work-recovery">
            <h2>{tr("Disconnects do not erase the task", "断线不会清空任务")}</h2>
            <p>{tr(
              "Task state is stored separately from the live process. If the paired computer is offline, eligible work waits for reconnection. A lost process handle is handled according to the saved recovery policy; Remote Arc does not blindly replay an action whose outcome is unknown.",
              "Task 状态与实时进程分开保存。已配对电脑离线时，符合条件的工作会等待重连。进程句柄丢失后按已保存的恢复策略处理；结果未知的动作不会被盲目重放。",
            )}</p>
            <p>{tr(
              "Keep-awake can help a supported online computer avoid sleeping during an authorized task. It cannot power on an offline computer.",
              "Keep-awake 可以帮助受支持且在线的电脑在授权任务期间避免休眠，但无法把离线或关机电脑远程开机。",
            )}</p>
          </section>

          <section id="work-security">
            <h2>{tr("The task never expands device authority", "Task 不会扩大设备权限")}</h2>
            <p>{tr(
              "Every execution still checks the paired device, enabled tools, Trusted Write Locations, protected sensitive paths and the saved task permission boundary. Changing the device policy can stop unattended work rather than silently granting new access.",
              "每次执行仍会检查已配对设备、启用工具、可信写入目录、受保护敏感路径以及已保存的任务权限边界。修改设备策略时，可以停止无人值守工作，而不是静默授予新的权限。",
            )}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
