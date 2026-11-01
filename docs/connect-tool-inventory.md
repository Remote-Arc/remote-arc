# Connect 远程工具清单

当前源代码注册 45 个远程 MCP 工具。Apps 的具体操作收拢在三个 Apps 工具中，不额外计入 45 个工具。

全部 Connect 工具能力向 Free 开放，每月仍为 10,000 次调用。Free 每月含 2 GB 二进制传输，`read_binary_file` 与临时文件链接的每次下载共用；付费套餐不限传输量。具体连接显示哪些工具还取决于部署开关、授权和设备能力。Arc 托管模型资格、Credits、第三方服务费用和所有现有额度保持原样。

## 设备与 Fleet（4）

| Tool | 用途 |
| --- | --- |
| `device_tools` | 查看指定设备可用的工具、参数和当前权限。 |
| `fleet_dispatch` | 根据系统、权限、工作目录和负载选择设备，并派发受支持操作。 |
| `fleet_sync_workspace` | 从 GitHub 的固定版本准备独立工作区，不覆盖已有项目。 |
| `list_devices` | 查看账号下的电脑、在线状态与设备能力。 |

## 文件（9）

| Tool | 用途 |
| --- | --- |
| `create_file_resource` | 创建绑定文件版本、可过期或撤销的临时下载链接。 |
| `edit_block` | 按匹配文本修改文件中的指定片段。 |
| `get_file_info` | 查看文件大小、类型、时间及版本信息。 |
| `list_directory` | 列出指定目录的文件与子目录。 |
| `read_binary_file` | 读取有大小上限的二进制字节区间，支持文件版本校验。 |
| `read_file` | 按行读取文本文件。 |
| `revoke_file_resource` | 撤销此前创建的文件下载链接。 |
| `undo_last_change` | 撤销当前范围内最新一条可恢复的文件修改。 |
| `write_file` | 写入或追加文本文件，并按本机设置保留 Undo。 |

## 进程（6）

| Tool | 用途 |
| --- | --- |
| `list_agent_sessions` | 查看 Codex、Claude Code 任务的工作目录、活动时间与 Git 元数据；需要设备 Agent 0.6.4 或更新版本。 |
| `list_processes` | 查看操作系统当前进程列表。 |
| `process_output` | 读取受管后台进程已捕获的标准输出与错误输出。 |
| `process_status` | 查询由 Remote Arc 管理的后台进程状态。 |
| `start_process` | 执行终端命令，或启动可查询、可停止的后台进程；部署、迁移、云管理等技术任务优先使用 CLI/API。 |
| `stop_process` | 停止指定受管进程及其子进程。 |

## 密钥（1）

| Tool | 用途 |
| --- | --- |
| `request_secret` | 通过 Remote Arc 页面向用户索取 API Key、Token 等密钥，不经过聊天。值在用户浏览器里加密到目标设备，AI 只拿到一次性句柄，用于 `start_process` 的 `stdin_secret`，或浏览器里指定网站上的 `shared_tab_fill` / `shared_tab_act` 填写；10 分钟内有效，只能用一次。 |

## 后台与定时任务（4）

| Tool | 用途 |
| --- | --- |
| `create_automation` | 保存获授权的确定性任务、定时工作或条件监听。 |
| `get_automation` | 查看指定任务的配置、状态和执行结果。 |
| `list_automations` | 查看账号下保存的任务及状态。 |
| `manage_automation` | 暂停、恢复或取消已保存的任务。 |

## Agent Goal（3）

| Tool | 用途 |
| --- | --- |
| `create_agent_goal` | 创建可保留目标、上下文与检查点的实验性 Agent 工作。 |
| `get_goal_context` | 读取目标当前状态及下一步决策所需上下文。 |
| `submit_goal_decision` | 向已有目标提交下一步决策，仍受执行契约限制。 |

## 任务浏览器（7）

| Tool | 用途 |
| --- | --- |
| `browser_runner_act` | 使用页面引用进行填写、点击、导航和上传等动作。 |
| `browser_runner_close` | 关闭任务浏览器，并按请求保留或删除检查点。 |
| `browser_runner_confirm` | 用页面证据确认已有提交的结果，避免重复提交。 |
| `browser_runner_snapshot` | 读取任务页面快照、元素引用与需要用户处理的阻碍。 |
| `browser_runner_start` | 为实际网页交互开始或恢复有站点范围限制的浏览器任务；技术任务优先使用 CLI/API。 |
| `browser_runner_status` | 查看浏览器任务、保存的检查点、资料和提交回执。 |
| `browser_runner_wait` | 等待用户交接、页面、文本、网址、上传或网络空闲条件，最长 40 秒；等待完成不代表提交成功。 |

## 共享浏览器标签页（6）

| Tool | 用途 |
| --- | --- |
| `shared_tab_act` | 在共享标签页执行受支持的浏览器动作。 |
| `shared_tab_click` | 在已开启「点击与填写」的共享标签页点击元素。 |
| `shared_tab_fill` | 在已授权的共享标签页填写普通字段。 |
| `shared_tab_list` | 查看 Chrome Companion 允许 Remote Arc 访问的标签页。 |
| `shared_tab_open` | 在已允许的网站范围内打开新的 Companion 标签页。 |
| `shared_tab_read` | 读取共享标签页的页面、选中文字、链接或表格。 |

## Apps（3）

| Tool | 用途 |
| --- | --- |
| `list_apps` | 列出已连接的应用账号（connectionId），并按任务搜索 37 个应用的固定操作目录；只读，不执行任何操作。 |
| `run_app_read_action` | 在已连接账号中执行一个只读操作；全部读取操作及其参数 Schema 都逐一列在工具定义中，不会修改任何数据。 |
| `run_app_write_action` | 在已连接账号中执行一个用户明确要求的更改（发送、发布、创建、更新或删除）；全部写入操作逐一列出，受账号权限、OAuth Scope 和写入去重保护。 |

## Skills（2）

| Tool | 用途 |
| --- | --- |
| `find_skills` | 按任务搜索内置、社区、工作流及个人导入的 Skill；搜索结果不代表执行器或模型已安装。 |
| `read_skill` | 读取指定 Skill 的完整说明与辅助资源；执行仍受设备权限和安装条件约束。 |

Agent Goal 的 source 模式由外部 AI 提交决策；hosted 模式另需现有托管模型资格和预算。定时保存目标不能保证外部聊天自动唤醒。

[任务可用性审查](connect-tools-and-task-audit-20261030.md)
