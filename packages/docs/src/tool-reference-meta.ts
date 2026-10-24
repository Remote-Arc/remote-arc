export type ToolGroup =
  | "devices"
  | "skills"
  | "files"
  | "processes"
  | "shared-tabs"
  | "browser-runner"
  | "apps"
  | "tasks"
  | "goals";
export const TOOL_GROUPS: Record<ToolGroup, { en: string; zh: string }> = {
  devices: { en: "Devices and workspaces", zh: "设备与工作区" },
  skills: { en: "Skills and guides", zh: "Skills 与使用指南" },
  files: { en: "Files and Undo", zh: "文件与撤销" },
  processes: { en: "Commands and processes", zh: "命令与进程" },
  "shared-tabs": { en: "Shared browser tabs", zh: "共享浏览器标签页" },
  "browser-runner": { en: "Browser Runner", zh: "任务浏览器" },
  apps: { en: "Connected apps", zh: "连接的应用" },
  tasks: { en: "Tasks and schedules", zh: "任务与定时" },
  goals: { en: "Agent goals · experimental", zh: "Agent 目标 · 实验能力" },
};
export function toolGroup(name: string): ToolGroup {
  if (["find_skills", "read_skill"].includes(name)) return "skills";
  if (name === "list_agent_sessions") return "processes";
  if (name.startsWith("shared_tab_")) return "shared-tabs";
  if (name.startsWith("browser_runner_")) return "browser-runner";
  if (["list_apps", "call_app"].includes(name)) return "apps";
  if (
    ["create_agent_goal", "get_goal_context", "submit_goal_decision"].includes(
      name,
    )
  )
    return "goals";
  if (name.includes("automation")) return "tasks";
  if (
    ["list_devices", "device_tools", "remote_arc_status"].includes(name) ||
    name.startsWith("fleet_")
  )
    return "devices";
  if (name.includes("process")) return "processes";
  return "files";
}
export const TOOL_COPY: Record<string, { zh: string; summary: string }> = {
  find_skills: {
    zh: "按任务搜索内置、社区、工作流及个人导入的 Skill；搜索结果不代表执行器或模型已安装。",
    summary: "Find relevant instructions across the Skill library; execution tools and dependencies must be checked separately.",
  },
  read_skill: {
    zh: "读取指定 Skill 的完整说明与辅助资源；执行仍受设备权限和安装条件约束。",
    summary: "Read a Skill's instructions and helper resources without granting execution permissions.",
  },
  browser_runner_wait: {
    zh: "等待用户交接、页面、文本、网址、上传或网络空闲条件，最长 40 秒；等待完成不代表提交成功。",
    summary: "Wait for a user handoff or page/upload/network condition for up to 40 seconds without confirming a submit.",
  },
  list_agent_sessions: {
    zh: "查看 Codex、Claude Code 任务的工作目录、活动时间与 Git 元数据；需要设备 Agent 0.6.4 或更新版本。",
    summary: "Inspect coding-agent session metadata and worktrees on a computer with Agent 0.6.4 or later.",
  },
  list_apps: {
    zh: "查找已连接的应用及账号、支持的操作与所需参数。",
    summary:
      "Find connected accounts and discover each app's supported operations.",
  },
  call_app: {
    zh: "使用指定账号读取或修改应用数据；写入还需要 Apps 写权限。",
    summary:
      "Run a supported operation with a connection ID and a stable request ID.",
  },
  list_devices: {
    zh: "查看账号下的电脑、在线状态与设备能力。",
    summary: "Find your linked computers and their current connection state.",
  },
  device_tools: {
    zh: "查看指定设备可用的工具、参数和当前权限。",
    summary:
      "Inspect the actual tool contract and permissions on one computer.",
  },
  fleet_dispatch: {
    zh: "根据系统、权限、工作目录和负载选择设备，并派发受支持操作。",
    summary: "Select an eligible computer and dispatch a supported operation.",
  },
  fleet_sync_workspace: {
    zh: "从 GitHub 的固定版本准备独立工作区，不覆盖已有项目。",
    summary: "Prepare an isolated GitHub checkout at an immutable revision.",
  },
  list_directory: {
    zh: "列出指定目录的文件与子目录。",
    summary: "List files and folders with a bounded directory depth.",
  },
  browse_directories: {
    zh: "浏览目录以选择本机工作位置。",
    summary: "Browse local folders to choose a workspace.",
  },
  read_file: {
    zh: "按行读取文本文件。",
    summary: "Read a bounded range of lines from a text file.",
  },
  read_binary_file: {
    zh: "读取有大小上限的二进制字节区间，支持文件版本校验。",
    summary: "Read bounded binary bytes and verify the expected file revision.",
  },
  create_file_resource: {
    zh: "创建绑定文件版本、可过期或撤销的临时下载链接。",
    summary: "Create a temporary file link tied to an exact file revision.",
  },
  revoke_file_resource: {
    zh: "撤销此前创建的文件下载链接。",
    summary: "Revoke a previously created file resource.",
  },
  get_file_info: {
    zh: "查看文件大小、类型、时间及版本信息。",
    summary: "Inspect file metadata and revision information.",
  },
  write_file: {
    zh: "写入或追加文本文件，并按本机设置保留 Undo。",
    summary: "Write or append a text file under the device's current policy.",
  },
  edit_block: {
    zh: "按匹配文本修改文件中的指定片段。",
    summary: "Replace matching text blocks with an expected replacement count.",
  },
  undo_last_change: {
    zh: "撤销当前范围内最新一条可恢复的文件修改。",
    summary: "Restore the latest eligible Local Undo snapshot.",
  },
  list_undo_actions: {
    zh: "列出当前范围内可恢复的文件修改记录。",
    summary: "List eligible file changes that have Local Undo snapshots.",
  },
  undo_change: {
    zh: "按回执 ID 恢复指定的文件修改。",
    summary: "Restore one eligible file change by its receipt ID.",
  },
  list_processes: {
    zh: "查看操作系统当前进程列表。",
    summary: "Inspect the computer's operating-system process list.",
  },
  start_process: {
    zh: "执行终端命令，或启动可查询、可停止的后台进程。",
    summary: "Run a shell command or start a managed background process.",
  },
  process_status: {
    zh: "查询由 Remote Arc 管理的后台进程状态。",
    summary: "Check the state of a managed background process.",
  },
  process_output: {
    zh: "读取受管后台进程已捕获的标准输出与错误输出。",
    summary: "Read a managed process's captured stdout and stderr.",
  },
  list_managed_processes: {
    zh: "列出 Remote Arc 启动并管理的后台进程。",
    summary: "List background processes managed by Remote Arc.",
  },
  stop_process: {
    zh: "停止指定受管进程及其子进程。",
    summary: "Stop a managed background process and its child-process tree.",
  },
  shared_tab_list: {
    zh: "查看 Chrome Companion 允许 Remote Arc 访问的标签页。",
    summary: "Find tabs shared or allowed through Chrome Companion.",
  },
  shared_tab_read: {
    zh: "读取共享标签页的页面、选中文字、链接或表格。",
    summary: "Read a shared tab's page, selection, links or table.",
  },
  shared_tab_click: {
    zh: "在已开启「点击与填写」的共享标签页点击元素。",
    summary: "Click an element on a tab with Click & fill enabled.",
  },
  shared_tab_fill: {
    zh: "在已授权的共享标签页填写普通字段。",
    summary: "Fill a field on a tab with Click & fill enabled.",
  },
  shared_tab_open: {
    zh: "在已允许的网站范围内打开新的 Companion 标签页。",
    summary: "Open an allowed site through Chrome Companion.",
  },
  shared_tab_act: {
    zh: "在共享标签页执行受支持的浏览器动作。",
    summary: "Perform a supported action in a shared browser tab.",
  },
  browser_runner_start: {
    zh: "在已连接电脑上开始或恢复有站点范围限制的浏览器任务。",
    summary: "Start or resume a task-scoped browser on a linked computer.",
  },
  browser_runner_snapshot: {
    zh: "读取任务页面快照、元素引用与需要用户处理的阻碍。",
    summary:
      "Read the task page, element references and human-action blockers.",
  },
  browser_runner_act: {
    zh: "使用页面引用进行填写、点击、导航和上传等动作。",
    summary:
      "Fill, click, navigate, upload or perform another task-browser action.",
  },
  browser_runner_status: {
    zh: "查看浏览器任务、保存的检查点、资料和提交回执。",
    summary: "Inspect task checkpoints, browser profiles and submit receipts.",
  },
  browser_runner_confirm: {
    zh: "用页面证据确认已有提交的结果，避免重复提交。",
    summary: "Confirm an existing submit using evidence on the current page.",
  },
  browser_runner_close: {
    zh: "关闭任务浏览器，并按请求保留或删除检查点。",
    summary: "Close the task browser and keep or forget its checkpoint.",
  },
  browser_runner_wait: {
    zh: "在设备端等待用户完成验证、页面变化或上传结束。",
    summary:
      "Wait on the device for user completion, a page condition or an upload.",
  },
  create_automation: {
    zh: "保存获授权的确定性任务、定时工作或条件监听。",
    summary:
      "Save authorized deterministic work, a schedule or a condition watch.",
  },
  list_automations: {
    zh: "查看账号下保存的任务及状态。",
    summary: "List saved tasks and their current state.",
  },
  get_automation: {
    zh: "查看指定任务的配置、状态和执行结果。",
    summary: "Read one task's contract, state and execution results.",
  },
  manage_automation: {
    zh: "暂停、恢复或取消已保存的任务。",
    summary: "Pause, resume or cancel saved work.",
  },
  create_agent_goal: {
    zh: "创建可保留目标、上下文与检查点的实验性 Agent 工作。",
    summary:
      "Create an experimental goal with durable context and checkpoints.",
  },
  get_goal_context: {
    zh: "读取目标当前状态及下一步决策所需上下文。",
    summary: "Read an experimental goal's context for its next decision.",
  },
  submit_goal_decision: {
    zh: "向已有目标提交下一步决策，仍受执行契约限制。",
    summary:
      "Submit a next-step decision within an existing goal's execution contract.",
  },
  remote_arc_status: {
    zh: "查看本地 MCP 的权限模式与原生执行后端。",
    summary: "Inspect the local MCP permission mode and execution backend.",
  },
};
