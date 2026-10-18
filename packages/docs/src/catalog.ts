export type DocCopy = { en: string; zh: string };
export type DocTopic = { slug: string; group: "start" | "work" | "understand"; title: DocCopy; description: DocCopy; legacyIds?: string[]; sections?: { heading: DocCopy; text: DocCopy }[]; links?: string[][] };
export const DOC_TOPICS: DocTopic[] = [
  {
    slug: 'install-app', group: 'start',
    title: {en: 'Install the web app', zh: '安装网页应用'},
    description: {en: 'Keep Agent or Admin in a dedicated window on your desktop or phone.', zh: '在电脑或手机上，将 Agent 或 Admin 安装为独立应用。'},
    sections: [
      {heading: {en: 'Agent and Admin', zh: 'Agent 与 Admin'}, text: {en: 'Open agent.remotearc.app for your personal workspace, or admin.remotearc.app with administrator access. Each has its own app name and launch destination. Agent opens Chat; Admin opens the operations overview. Install from Profile settings or the Admin sidebar, or use your browser’s install menu.', zh: '在 agent.remotearc.app 打开个人工作空间，管理员可使用 admin.remotearc.app。两者有独立的应用名称和启动位置：Agent 打开 Chat，Admin 打开运营总览。可从个人资料设置、Admin 侧栏或浏览器安装菜单进行安装。'}},
      {heading: {en: 'On your device', zh: '在你的设备上'}, text: {en: 'Chrome and Edge offer Install app. On iPhone or iPad use Share → Add to Home Screen. In Mac Safari use File → Add to Dock. Browser support determines which installation option appears.', zh: 'Chrome、Edge 支持安装应用；iPhone、iPad 使用分享 → 添加到主屏幕；Mac Safari 使用文件 → 添加到程序坞。实际安装入口取决于浏览器支持。'}},
      {heading: {en: 'Connected work', zh: '保持联网'}, text: {en: 'The installed app uses the same account and permissions as the website. Conversations, APIs and authenticated pages are never stored in the service worker cache. If offline, a neutral reconnect page appears; new model and tool calls need a connection. Hosted runs already accepted by the server can continue within their limits while the window is closed.', zh: '安装版沿用网页的账号和权限。Service Worker 不缓存对话、API 或已登录页面。断网时显示重新连接页面，新的模型和工具调用需要联网。服务端已经接受的托管执行可在窗口关闭后继续，仍受各项上限约束。'}}
    ]
  },
  {
    "slug": "connect",
    "group": "start",
    "title": {
      "en": "Connect your AI",
      "zh": "连接你的 AI"
    },
    "description": {
      "en": "Set up Remote MCP, pair a computer and choose the AI chat you use.",
      "zh": "配置 Remote MCP、配对电脑，使用你熟悉的 AI 聊天。"
    },
    "legacyIds": [
      "start",
      "model",
      "tools"
    ]
  },
  {
    "slug": "devices",
    "group": "start",
    "title": {
      "en": "Devices and permissions",
      "zh": "设备与权限"
    },
    "description": {
      "en": "Manage Windows, macOS and Linux computers, trusted locations and background access.",
      "zh": "管理 Windows、macOS、Linux 设备、可信目录和后台连接。"
    },
    "legacyIds": [
      "policy"
    ]
  },
  {
    "slug": "device-fleet",
    "group": "work",
    "title": {
      "en": "Intelligent device fleet",
      "zh": "智能设备调度"
    },
    "description": {
      "en": "Match work to the right computer using permissions, capabilities and current load.",
      "zh": "依据权限、能力和当前负载，为工作匹配合适的电脑。"
    },
    "sections": [
      {
        "heading": {
          "en": "Filter before balancing",
          "zh": "先核对条件，再平衡负载"
        },
        "text": {
          "en": "Only online, unpaused devices in your account are eligible. Required tools, operating system, trusted workspace and any scheduled-task permissions are checked before ranking. Starting a process also needs status, output and stop tools. An offline or unauthorized computer is never used as a fallback.",
          "zh": "只考虑当前账号中在线且未暂停的设备。先检查所需工具、操作系统、可信工作目录及定时任务权限，再进行排序。启动进程还需状态、输出和停止工具。不会回退到离线或无权使用的电脑。"
        }
      },
      {
        "heading": {
          "en": "Account for real work",
          "zh": "根据实际工作判断负载"
        },
        "text": {
          "en": "Ranking considers active tasks, recent interactive activity, managed processes, CPU, memory and connection stability. Capacity samples older than two minutes are treated as unknown, not idle. Windows and WSL agents sharing a host are counted together so the same physical capacity is not counted twice.",
          "zh": "排序考虑活动任务、近期交互、受管进程、CPU、内存和连接稳定性。超过两分钟的负载样本视为未知，而不是空闲。同一主机上的 Windows 与 WSL Agent 合并计入，避免重复计算物理资源。"
        }
      },
      {
        "heading": {
          "en": "Use it from your AI",
          "zh": "从 AI 中使用"
        },
        "text": {
          "en": "Ask your compatible MCP client to choose a suitable computer, or ask Arc when its hosted workspace is enabled. State any required operating system, project location, tools or minimum available memory. Selection chooses an execution environment; it does not move existing projects or retry an uncertain external write on a second machine.",
          "zh": "让兼容 MCP 客户端选择合适电脑，或在 Arc 托管工作空间开启后直接对 Arc 说。明确所需操作系统、项目位置、工具或最低可用内存。调度选择执行环境，不自动搬迁项目，也不会把结果不明的外部写入换台机器重试。"
        }
      }
    ],
    "links": [
      [
        "/docs/devices",
        "Device setup",
        "设备配置"
      ],
      [
        "/docs/tasks",
        "Tasks and routines",
        "任务与 Routine"
      ]
    ]
  },
  {
    "slug": "apps",
    "group": "work",
    "title": {
      "en": "Apps and account connections",
      "zh": "Apps 与账号连接"
    },
    "description": {
      "en": "Connect once, then use the available tools from your AI.",
      "zh": "连接一次，在 AI 中使用账号已授权的工具。"
    },
    "sections": [
      {
        "heading": {
          "en": "Connect your own account",
          "zh": "连接自己的账号"
        },
        "text": {
          "en": "Choose an app and connect your account. Available read and write actions are enabled together; there is no additional write switch or per-action approval in Remote Arc. OAuth apps open the provider consent page. Some providers, including Runway, require an API credential from that service; this is separate from a model API key. Cloud app operations do not need a local computer or Arc Agent.",
          "zh": "选择应用并连接账号。可用读取与写入操作一起启用，Remote Arc 不再增加写入开关或逐次审批。OAuth 应用打开服务商的授权页面；Runway 等部分应用需要该服务自己的 API 凭证，这与模型 API Key 不同。云端应用操作不要求本地电脑，也无需 Arc Agent。"
        }
      },
      {
        "heading": {
          "en": "Discover and use operations",
          "zh": "发现与使用操作"
        },
        "text": {
          "en": "Authorize apps:read for a compatible MCP client. Ask the AI to use list_apps to find a provider, then request that provider's operation schemas. call_app takes the connection ID, operation, arguments and a stable requestId. Discovery is paginated so hundreds of integration schemas do not fill every chat. Remote Arc implements bounded native API actions; a catalog entry does not promise all features of the upstream service.",
          "zh": "为兼容的 MCP 客户端授权 apps:read。让 AI 使用 list_apps 查找应用，再按需读取该应用的操作结构。call_app 接收连接 ID、操作、参数及稳定的 requestId。发现接口支持分页，避免把大量应用的操作定义塞进每次聊天。Remote Arc 提供有边界的原生 API 操作，目录收录不代表覆盖服务商的全部功能。"
        }
      },
      {
        "heading": {
          "en": "Execute and inspect results",
          "zh": "执行与检查结果"
        },
        "text": {
          "en": "The MCP client needs the relevant apps:read or apps:write scope and the provider must have granted the underlying permissions. Actions use a stable request ID so retries do not duplicate an external change. A changed or revoked connection blocks new execution. Unknown outcomes are retained for inspection and are not automatically repeated. The provider acknowledgement and any final artifact remain the evidence for completion.",
          "zh": "MCP 客户端需要相应 apps:read 或 apps:write Scope，服务商也必须已授予底层权限。操作使用稳定请求 ID，重试不会重复外部修改。连接被更改或撤销后阻止新执行。结果不明时保留记录供核查，不自动重复。以服务商确认及最终产物作为完成依据。"
        }
      },
      {
        "heading": {
          "en": "Connection states and rollout",
          "zh": "连接状态与开放进度"
        },
        "text": {
          "en": "Waiting for configuration means Remote Arc has not supplied this provider's platform credentials or enabled the service. It is different from a disconnected user account. After connecting, revoked or expired credentials may require reconnection. Disconnecting removes the saved credential and blocks pending actions. The initial production release relies on automated protocol checks; real-account workflows are being tried by the owner and are not certified across all providers.",
          "zh": "「等待配置」表示 Remote Arc 尚未配置该平台凭证或开启服务，与用户账号未连接不同。连接后，已撤销或过期的凭证可能需要重新授权。断开连接会移除保存的凭证，并阻止待执行操作。首批生产发布基于自动协议检查，由负责人在上线后试用真实账号；不代表全部平台均已通过真实账号验收。"
        }
      }
    ],
    "links": [
      [
        "/integrations",
        "Explore Apps",
        "查看应用目录"
      ],
      [
        "/docs/usage-and-costs",
        "Usage and costs",
        "用量与费用"
      ]
    ]
  },
  {
    "slug": "files",
    "group": "work",
    "title": {
      "en": "Files and Undo",
      "zh": "文件与撤销"
    },
    "description": {
      "en": "Read, edit and share bounded file results with local Undo and revision checks.",
      "zh": "读取、编辑和分享文件结果，使用本地撤销与版本校验。"
    },
    "legacyIds": [
      "files"
    ]
  },
  {
    "slug": "processes",
    "group": "work",
    "title": {
      "en": "Commands and recovery",
      "zh": "命令与恢复"
    },
    "description": {
      "en": "Start approved processes, collect output and inspect background recovery.",
      "zh": "执行已授权命令、读取输出，了解后台恢复。"
    },
    "legacyIds": [
      "processes"
    ]
  },
  {
    "slug": "browser",
    "group": "work",
    "title": {
      "en": "Browser tabs",
      "zh": "浏览器标签页"
    },
    "description": {
      "en": "Share selected tabs read-only and opt into click and fill per tab.",
      "zh": "只读共享指定标签页，按标签页开启点击与填写。"
    },
    "legacyIds": [
      "browser"
    ]
  },
  {
    "slug": "tasks",
    "group": "work",
    "title": {
      "en": "Tasks and Routines",
      "zh": "任务与 Routines"
    },
    "description": {
      "en": "One-off tasks and repeating routines, created and managed through conversation.",
      "zh": "通过对话创建和管理一次性任务与重复 Routine。"
    },
    "links": [
      [
        "/docs/long-running-work",
        "Long-running work guide",
        "持续工作指南"
      ]
    ],
    "sections": [
      {
        "heading": {
          "en": "Say what you need",
          "zh": "说出你需要什么"
        },
        "text": {
          "en": "A task is one piece of work. A routine repeats on a schedule. In Arc Chat, describe the result and timing; Arc asks for missing details and saves the work using a real tool. Tasks and Routines show status and results, without a configuration form. Connect remains your MCP connection layer for an external AI client.",
          "zh": "Task 是一次工作，Routine 按计划重复执行。在 Arc Chat 里描述结果和时间，Arc 会确认缺少的信息，再通过真实工具保存。Tasks 和 Routines 展示状态与结果，不需要配置表单。Connect 继续作为外部 AI 客户端使用的 MCP 连接层。"
        }
      },
      {
        "heading": {
          "en": "Timing and availability",
          "zh": "时间与可用性"
        },
        "text": {
          "en": "Routines support a daily local time, optional weekdays and an explicit IANA timezone, or an interval of at least 15 minutes. A nonexistent daylight-saving time is skipped; a repeated local time runs once. Each execution uses the same account permissions and fresh model budgets. Computer work requires a reachable, permitted device. Arc hosted execution requires platform configuration; availability is shown in Chat.",
          "zh": "Routine 支持明确 IANA 时区的本地每日时间、可选星期，或至少 15 分钟的间隔。夏令时不存在的时间会跳过，重复出现的本地时间只运行一次。每轮重新检查账号权限和模型预算；电脑操作要求设备在线且具备权限。Arc 托管执行需要平台完成配置，Chat 会显示可用状态。"
        }
      },
      {
        "heading": {
          "en": "Keep the result with the work",
          "zh": "让结果随工作保留"
        },
        "text": {
          "en": "Messages, tool results and run status are saved. You can stop a chat run and ask Arc to pause, resume or update saved work. Stopping prevents further dispatch; an external action already in flight may still complete. Failed or unconfirmed recurring work pauses for inspection rather than silently repeating a possible write.",
          "zh": "消息、工具结果和运行状态会保存。可以停止当前运行，或让 Arc 暂停、恢复、修改已保存工作。停止会阻止新的派发，已经发出的外部请求仍可能完成。失败或结果未确认的重复工作暂停等待核查，避免悄悄重复可能已发生的写入。"
        }
      }
    ]
  },
  {
    "slug": "skills",
    "group": "understand",
    "title": {
      "en": "Skills",
      "zh": "技能"
    },
    "description": {
      "en": "Use reusable cloud-hosted guidance with the execution tools you have authorized.",
      "zh": "在已授权的执行工具上，使用可复用的云端技能指引。"
    },
    "sections": [
      {
        "heading": {
          "en": "Discover the Skill library",
          "zh": "发现技能库"
        },
        "text": {
          "en": "The MCP resource remotearc://skills/catalog lists nine built-in Skills. Read remotearc://skills/<id> for a selected Skill when your AI client supports MCP resources. The catalog includes browser operation, autonomous browser work, desktop operation, image creation, video creation, transcription, research, UI inspection and scheduled work. Resource access requires signing in.",
          "zh": "MCP 资源 remotearc://skills/catalog 列出九项内置 Skills。AI 客户端支持 MCP 资源时，可读取 remotearc://skills/<id> 获取所选技能。目录包含浏览器操作、自主浏览器工作、桌面操作、图片创作、视频创作、转写、研究、界面检查与定时工作。读取资源需要登录。"
        }
      },
      {
        "heading": {
          "en": "Guidance and executable capabilities",
          "zh": "指引与可执行能力"
        },
        "text": {
          "en": "A Skill supplies a workflow; it does not grant device permissions, install model weights or create a provider account. Existing approved tools still execute the work. The initial Skill runtime supports two bounded read-only browser executors. Other paths report missing engines or approval requirements instead of pretending to execute. Inspect the actual result and available tools for each task.",
          "zh": "Skill 提供工作方法，不会授予设备权限、安装模型或创建服务商账号。工作仍由现有且已授权的工具执行。初始技能运行时支持两项有边界的只读浏览器执行器；其他路径会说明所缺引擎或审批要求，不会假装已执行。请按任务检查实际结果与可用工具。"
        }
      },
      {
        "heading": {
          "en": "Combine Skills with Apps and devices",
          "zh": "组合 Skills、Apps 和设备"
        },
        "text": {
          "en": "Consult a relevant Skill, then discover the specific app or device operation required. A Skill is guidance, not a permission grant. Connected app operations are enabled within provider scopes; device execution follows its local policy.",
          "zh": "先读取相关 Skill，再发现所需应用或设备操作。Skill 是指引，不授予权限。连接的应用在服务商授权范围内启用操作，设备执行遵循本地策略。"
        }
      }
    ]
  },
  {
    "slug": "arc",
    "group": "understand",
    "title": {
      "en": "Arc and AI teammates",
      "zh": "Arc 与 AI 队友"
    },
    "description": {
      "en": "Understand what Connect provides today and what the Arc Agent foundation supports.",
      "zh": "了解 Connect 当前能力和 Arc Agent 的基础建设。"
    },
    "sections": [
      {
        "heading": {
          "en": "One platform, two ways to work",
          "zh": "一个平台，两种工作方式"
        },
        "text": {
          "en": "Connect brings your own AI client to apps and computers through MCP. Arc is the new hosted personal-agent workspace on the same connections: chat, tool execution, one-off tasks and routines. You do not supply a model API key. Arc availability depends on the platform completing its model configuration.",
          "zh": "Connect 通过 MCP 把你自己的 AI 客户端连接到应用与电脑。Arc 是同一套连接之上的新托管个人 Agent 工作空间，包括对话、工具执行、一次性任务和 Routine。用户不需要提供模型 API Key；Arc 的开放取决于平台完成模型配置。"
        }
      },
      {
        "heading": {
          "en": "Auto and premium models",
          "zh": "Auto 与高级模型"
        },
        "text": {
          "en": "Auto uses a platform-funded OpenAI model. Premium OpenAI and Claude models require a stored paid-model entitlement, a provider grant and available budget. Each request reserves its maximum estimated cost before inference and settles measured usage afterwards. Global, account, organization and conversation limits apply. Runs also have explicit step, time and token ceilings.",
          "zh": "Auto 使用平台出资的 OpenAI 模型。高级 OpenAI 和 Claude 模型要求已保存的付费模型权益、服务商授权及剩余额度。每次推理前预留估算最大成本，之后按实际用量结算，受全局、账号、组织及对话预算限制；运行还具备明确的步骤、时间与 Token 上限。"
        }
      },
      {
        "heading": {
          "en": "Own computers, intelligent placement",
          "zh": "自己的电脑，智能调度"
        },
        "text": {
          "en": "Arc can inspect your own fleet and select an eligible device for the task. Placement considers tools, platform, trusted workspace and fresh capacity signals. It does not assume a project exists on another computer or move files implicitly. A selected device enforces its current local execution policy.",
          "zh": "Arc 可以查看自己的设备集群并为任务选择符合条件的电脑，考虑工具、平台、可信目录与实时负载。它不会假设另一台电脑上已有同一项目，也不会暗中搬迁文件。选中的设备仍执行当前本地权限策略。"
        }
      },
      {
        "heading": {
          "en": "Your 14-day trial",
          "zh": "你的 14 天试用"
        },
        "text": {
          "en": "Activate the trial in Arc Chat after the platform is configured. It lasts fourteen consecutive days per account; refreshing, signing out or activating again does not extend it. Auto and capped premium inference, Tasks and Routines are included. Model spending is limited per day, provider allowance and run. At expiry, new hosted inference stops while conversations and account connections remain. Connect uses its own plan. No credit card is requested and there is no automatic charge.",
          "zh": "平台配置完成后，在 Arc Chat 主动开启试用。每个账号连续十四天，刷新、退出或再次开启不会延长。包含 Auto、有上限的高级模型推理、Tasks 和 Routines。模型消费受每日额度、服务商授权总额及单次运行限制。到期后停止新的托管推理，对话和账号连接仍保留，Connect 按原套餐使用。不要求信用卡，也不会自动扣费。"
        }
      }
    ],
    "links": [
      [
        "/arc",
        "Explore Arc",
        "了解 Arc"
      ],
      [
        "/roadmap",
        "Product roadmap",
        "产品路线图"
      ]
    ]
  },
  {
    "slug": "usage-and-costs",
    "group": "understand",
    "title": {
      "en": "Usage and costs",
      "zh": "用量与费用"
    },
    "description": {
      "en": "Separate Remote Arc limits, user API charges and developer-project costs.",
      "zh": "区分 Remote Arc 额度、用户 API 费用和开发者项目成本。"
    },
    "sections": [
      {
        "heading": {
          "en": "Three independent bills",
          "zh": "三条独立的费用"
        },
        "text": {
          "en": "Remote Arc tool-call entitlement, your AI chat subscription and third-party App usage are separate. Connecting an App does not make its API free. OAuth identifies who authorizes an account; it does not decide who receives the API bill. A user's web subscription can differ from that provider's API plan or credit balance.",
          "zh": "Remote Arc 工具调用额度、你的 AI 聊天订阅和第三方 App 用量分别计算。连接应用不代表 API 免费。OAuth 确定谁授权账号，不决定 API 账单由谁承担。用户的网页订阅也可能与同一服务商的 API 套餐或积分分开。"
        }
      },
      {
        "heading": {
          "en": "Your connected account",
          "zh": "你连接的账号"
        },
        "text": {
          "en": "Runway uses an API key from your own API project and spends that project's generation credits. WhatsApp uses your Business account, phone number and API credential, with charges following the actual Business billing arrangement. Vercel, Supabase and Linear use OAuth to your account or workspace; their hosting, database or workspace charges still follow that account's plan.",
          "zh": "Runway 使用你自己 API 项目的密钥，并消耗该项目的生成积分。WhatsApp 使用你的 Business 账号、电话号码及 API 凭证，费用遵循实际 Business 账单安排。Vercel、Supabase 和 Linear 通过 OAuth 连接你的账号或工作区，其托管、数据库或工作区费用仍按该账号的套餐处理。"
        }
      },
      {
        "heading": {
          "en": "Managed OAuth and platform costs",
          "zh": "托管 OAuth 与平台成本"
        },
        "text": {
          "en": "Remote Arc manages the developer OAuth application for supported providers. Some quotas and fees attach to that developer project even when every user authorizes their own account. X managed OAuth uses Remote Arc's X API project rather than the user's X Premium subscription. Google Workspace has announced project quota and scaled-usage billing changes. Remote Arc also bears hosting, database, credential-management and maintenance costs.",
          "zh": "对于支持的平台，Remote Arc 管理开发者 OAuth 应用。即使每个用户授权自己的账号，部分额度和费用仍归属于开发者项目。X 托管 OAuth 使用 Remote Arc 的 X API 项目，与用户 X Premium 订阅不同。Google Workspace 已公布项目额度和规模化用量计费调整。Remote Arc 还承担托管、数据库、凭证管理及维护成本。"
        }
      },
      {
        "heading": {
          "en": "Review the cost-bearing action",
          "zh": "检查产生费用的操作"
        },
        "text": {
          "en": "Runway generation validates the requested model, duration and maximum estimated credits before dispatch. The estimate is not a provider-enforced financial cap. Third-party account charges remain separate from Remote Arc tool usage and hosted Arc inference. Check the provider billing controls for the connected account.",
          "zh": "Runway 生成在派发前检查模型、时长和预估积分上限。预估不是服务商强制执行的财务上限。第三方账号费用、Remote Arc 工具用量与 Arc 托管模型推理分别计算，请检查所连接账号的服务商计费控制。"
        }
      }
    ],
    "links": [
      [
        "https://docs.dev.runwayml.com/guides/pricing/",
        "Runway API pricing",
        "Runway API 计费"
      ],
      [
        "https://developers.google.com/workspace/tools-safety",
        "Google Workspace quotas",
        "Google Workspace 额度规则"
      ],
      [
        "/pricing",
        "Remote Arc plans",
        "Remote Arc 套餐"
      ]
    ]
  },
  {
    "slug": "security",
    "group": "understand",
    "title": {
      "en": "Security and data handling",
      "zh": "安全与数据处理"
    },
    "description": {
      "en": "Understand execution boundaries, stored data, permissions and revocation.",
      "zh": "了解执行边界、数据存储、权限和撤销。"
    },
    "legacyIds": [
      "sandbox",
      "data"
    ],
    "links": [
      [
        "/security-model",
        "Security model",
        "安全模型"
      ]
    ]
  },
  {
    "slug": "architecture",
    "group": "understand",
    "title": {
      "en": "Architecture",
      "zh": "系统架构"
    },
    "description": {
      "en": "Follow a request through MCP, the cloud relay and the local execution core.",
      "zh": "了解请求如何经过 MCP、云端 Relay 和本地执行核心。"
    },
    "legacyIds": [
      "routing",
      "architecture-deep",
      "architecture-trust",
      "architecture-task",
      "architecture-persistence",
      "architecture-data",
      "architecture-limits"
    ]
  },
  {
    "slug": "admin",
    "group": "understand",
    "title": {
      "en": "Administration",
      "zh": "管理功能"
    },
    "description": {
      "en": "Learn about account roles, operational monitoring and the Admin service boundary.",
      "zh": "了解账号角色、运行监控和 Admin 服务边界。"
    },
    "sections": [
      {
        "heading": {
          "en": "Administrator access",
          "zh": "管理员访问"
        },
        "text": {
          "en": "Admin requires a signed-in account with the current administrator role. The platform checks that role for each operation rather than trusting the browser's claimed identity. Administrative writes require the configured Admin origin and appropriate request format. Ordinary users cannot use Admin endpoints to read another user's data.",
          "zh": "Admin 要求已登录账号具备当前有效的管理员角色。平台逐次校验角色，不信任浏览器自称的身份。管理写入需要符合配置的 Admin 来源及请求格式。普通用户不能通过 Admin 接口读取其他用户的数据。"
        }
      },
      {
        "heading": {
          "en": "Platform operations",
          "zh": "平台运行管理"
        },
        "text": {
          "en": "Admin provides account and device monitoring, plan and credit administration, service signals and website submissions. Existing Connect entitlements and hosted model budgets are separate. Model keys alone do not authorize paid inference. Administrative grants change only their defined scope; they do not silently expand device permissions.",
          "zh": "Admin 提供账号与设备监控、套餐和额度管理、服务信号与官网提交信息。现有 Connect 权益与托管模型预算分别处理。模型密钥本身不授权付费推理；管理授权只改变定义的范围，不会悄悄扩展设备权限。"
        }
      },
      {
        "heading": {
          "en": "Separate service rollout",
          "zh": "独立服务发布"
        },
        "text": {
          "en": "The independent Admin repository has a dedicated service boundary and release workflow. The initial main-platform release retains the existing Admin experience. A later verified configuration switch can route it through the separate service without moving account data or the device registry. Publishing the code does not itself perform that cutover.",
          "zh": "独立 Admin 仓库具备专用服务边界与发布流程。主平台首批发布继续使用现有 Admin 体验；后续可通过经过验证的配置切换进入独立服务，无需迁移账号数据或设备注册表。发布代码不会自动执行这一切换。"
        }
      }
    ]
  },
  {
    "slug": "troubleshooting",
    "group": "start",
    "title": {
      "en": "Troubleshooting",
      "zh": "排查问题"
    },
    "description": {
      "en": "Resolve device, browser, authorization and availability problems.",
      "zh": "排查设备、浏览器、授权及功能可用性问题。"
    },
    "legacyIds": [
      "troubleshoot",
      "limits"
    ]
  },
  {
    "slug": "reference",
    "group": "understand",
    "title": {
      "en": "Complete reference",
      "zh": "完整参考"
    },
    "description": {
      "en": "Read the original detailed product guide in one place.",
      "zh": "在同一页面查看完整的产品操作参考。"
    }
  }
];
export const DOC_PATHS = DOC_TOPICS.map(topic => "/docs/" + topic.slug);
export const docTopic = (path: string) => DOC_TOPICS.find(topic => "/docs/" + topic.slug === path);
