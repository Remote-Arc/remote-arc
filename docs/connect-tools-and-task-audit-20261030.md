# Connect 工具开放与任务可用性审查

审查日期：2026-10-30（Pacific/Auckland）。基线：`2de4458d`，并验证本 PR 的套餐调整。

## 本次产品规则

所有账户使用相同的 Connect 工具能力，包括文件、进程、浏览器、Apps、Skills、Long Task、定时任务、条件监听、验证循环、source Agent Goal 和明确授权的保持唤醒。

Free 每月仍为 **10,000 次工具调用**。现有额度计量方式、设备数量、速率、传输大小、任务轮数/期限、账户与设备授权不变。取消的是 Connect 能力的付费门槛。Arc 托管模型访问、Credits、模型预算和第三方服务费用仍使用原有规则。

`read_binary_file`、`create_file_resource` 和 `revoke_file_resource` 均不再检查套餐。临时文件链接是绑定文件版本、10 分钟过期、可以撤销的下载地址；它现在同样向 Free 开放。传输分块是各套餐共用的技术边界，不是付费能力。

不需要数据库迁移或重发 Go Agent；需要按既有流程发布 Relay 与网站，线上行为才会改变。

## 能力与验证边界

| 能力 | 当前可做的工作 | 验证结果与边界 |
| --- | --- | --- |
| Long Task | 保存明确命令，后台启动并跟踪退出状态；关闭聊天不会取消 | 真机 Mac Agent 的单次 10 秒命令完成，退出码 0；本地 Worker/D1/WebSocket 集成通过 |
| 定时任务 | 指定时刻或固定间隔运行保存的命令 | 真机单次定时任务完成，退出码 0；一分钟 Cron，执行与状态更新存在分钟级延迟 |
| 条件监听 | 匹配 Webhook 后运行已保存操作 | 本地完整集成通过；生产外部事件源的配置仍由使用者完成 |
| Goal Loop | 重复同一命令并运行验证，验证成功或到达限制后结束 | 本地集成通过；不会自行改写失败的命令 |
| Agent Goal / source | 保存目标、计划、执行片段、上下文与决策记录；由外部 AI 提交下一步 | Free 的真实 MCP 注册/分发、读取上下文、提交决策与完成闭环均通过本地 SQLite/设备传输测试；新的判断仍需要 AI 宿主继续运行 |
| Agent Goal / hosted | 已配置的模型网关执行有预算的规划循环 | 本地模型 fixture 的完整集成通过；托管模型资格与预算保持原样，本次没有产生真实付费模型请求 |

真实测试使用当前授权账户和 Mac Agent 0.6.5-rc.1；两个任务均仅运行一次，最终 completed、exit_code=0、next_run_at=null，没有留下循环任务。真实测试证明当前生产执行链路可以跑通，不能证明数小时/整夜运行、宿主自动唤醒、系统重启或断电续跑。

## 确认的问题

### Connect 管理页入口与数据源不一致

`dashboard-workspaces.ts` 把 `/automations` 和 `/dashboard/connect/tasks` 解析成 `agent-goals`。当前页面渲染 `ArcWorkWorkspace`，读取 `/api/arc/work`；服务端 `arcSessionWork` 仅查询 `native_arc.version=1` 的记录。

普通 Connect 命令任务和外部 source Agent Goal 因而不能依靠这个页面查看。Arc 未开放时，这个入口还会退回 Connect 概览。MCP 返回的任务管理链接与实际管理体验存在断层。旧创建表单的状态与文案仍在主文件中，但目前没有相应表单渲染，不应把残留代码当成现行 UI。

相关位置：

- [路由映射](../apps/ui/src/dashboard-workspaces.ts)
- [当前任务页面](../apps/ui/src/arc-workspace.tsx)
- [Arc 专属任务查询](../apps/relay/src/arc-work.ts)

### 持久状态不能保证进程和输出跨重启保留

云端保存任务定义、租约、状态、执行次数、决策与运行记录。Go 的受管进程表在内存中，已结束进程的本机保留窗口为 30 分钟。Agent 重启后可能丢失句柄，当前恢复策略是重新执行当前尝试或失败；它不能恢复任意程序执行现场。

Long Task 真机记录保存了退出码，但 `automation_runs.output_summary` 为 null；标准输出仍可通过本机 process_output 读取。完整输出并未因此成为长期云端结果档案。

默认 recovery=restart 在丢失句柄后可能重新执行当前命令；有外部副作用的命令应明确选择 fail，或由业务脚本保证幂等。已经发出但结果未知的调用会暂停核实，本地回归验证了不会直接重放这种调用。

相关位置：

- [Go 进程管理](../packages/execution-core/execution/process.go)
- [自动化执行与恢复](../apps/relay/src/automations.ts)
- [状态、租约与记录](../apps/relay/src/automation-store.ts)

### source Agent Goal 需要可用的决策来源

保存好的确定性执行片段可以继续执行。需要新判断时，任务进入 awaiting_agent / needs_reasoning，等待 get_goal_context + submit_goal_decision。外部聊天结束后自动唤醒模型尚未经过本次真实验收。保存任务 ID 或事件回调本身不能保证聊天宿主会继续推理。

Connect 的固定间隔按照原始时间节拍计算，错过的时间槽会跳过；它不是每天某个本地时刻的时区/DST 日历。Arc 原生 Routine 有另一套日历逻辑，不能据此承诺 Connect 命令任务也支持相同语义。

## 建议的投入顺序

1. 保持全部 Connect 工具免费，沿用 10,000 次月额度；把它作为让用户接入和实际使用的基础能力。
2. 先恢复独立的 Connect 任务管理入口，直接使用现有 /api/automations：查看状态、最近退出码、错误、下次执行时间和暂停/恢复/取消。不依赖 Arc 模型或 Credits，也不必重做复杂创建表单。
3. 为命令任务补齐有界的结果摘要，并明确展示进程丢失后的恢复方式。
4. 对外主推后台命令、定时执行与验证循环；Agent Goal 保留为高级能力，明确显示“等待原 AI”。
5. 需要现有模型 API 时，可让获授权的本地脚本调用它，由 Remote Arc 负责定时启动与跟踪；暂不扩建另一套持续 Agent 平台。

## 本次通过的检查

- pnpm -r typecheck
- pnpm --filter @remotearc/ui build
- pnpm test:goals
- pnpm test:automations（本地 Worker、D1、WebSocket、模型/API fixtures）
- Connect Unlimited 与 Free 10,000 次额度回归，包含额度耗尽与月重置
- Free 二进制分块、版本续读、临时链接创建/下载/撤销
- Free 创建四种自动化模式及 source Goal，任务管理、决策与完成闭环
- 设备工具开关、OAuth scope、文件变更中断和链接撤销检查

本 PR 实现工具开放与相关说明；上面列出的管理页和长期结果记录问题是审查结论，尚未在本 PR 修复。
