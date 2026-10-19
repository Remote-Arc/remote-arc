export type DocCopy = { en: string; zh: string };
export type DocTopic = { slug: string; group: "start" | "work" | "understand"; title: DocCopy; description: DocCopy; legacyIds?: string[]; sections?: { heading: DocCopy; text: DocCopy }[]; links?: string[][] };
export const DOC_TOPICS: DocTopic[] = [
  {
    slug: 'install-app', group: 'start',
    title: {en: 'Install the web app', zh: '安装网页应用'},
    description: {en: 'Keep your Remote Arc workspace in a dedicated window on your desktop or phone.', zh: '在电脑或手机上，将 Remote Arc 工作空间安装为独立应用。'},
    sections: [
      {heading: {en: 'Your workspace, one click away', zh: '一键打开你的工作空间'}, text: {en: 'Open agent.remotearc.app and sign in. Install Remote Arc from Profile settings or your browser’s install menu. The app opens your Connect overview, with your devices, app connections and recent activity. Arc Chat is coming soon.', zh: '打开 agent.remotearc.app 并登录，在个人资料设置或浏览器安装菜单中安装 Remote Arc。应用启动后进入 Connect 概览，可查看设备、应用连接和最近活动。Arc Chat 即将上线。'}},
      {heading: {en: 'On your device', zh: '在你的设备上'}, text: {en: 'Chrome and Edge offer Install app. On iPhone or iPad use Share → Add to Home Screen. In Mac Safari use File → Add to Dock. Browser support determines which installation option appears.', zh: 'Chrome、Edge 支持安装应用；iPhone、iPad 使用分享 → 添加到主屏幕；Mac Safari 使用文件 → 添加到程序坞。实际安装入口取决于浏览器支持。'}},
      {heading: {en: 'Stay connected', zh: '保持联网'}, text: {en: 'Use the same account and settings as on the website. You need an internet connection to view current activity and use tools. If you go offline, reconnect to continue. Closing the web app does not stop the local Agent on your paired computer; manage its background connection in Devices.', zh: '安装后沿用网页的账号和设置。查看实时活动和使用工具需要联网，离线后重新连接即可继续。关闭网页应用不会停止已配对电脑上的本机 Agent；你可以在设备页面管理后台连接。'}}
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
          "zh": "选择应用并连接账号。可用读取与写入操作一起启用，Remote Arc 无需额外写入开关或逐次审批。OAuth 应用打开服务商的授权页面；Runway 等部分应用需要该服务自己的 API 凭证，这与模型 API Key 不同。云端应用操作不要求本地电脑，也无需 Arc Agent。"
        }
      },
      {
        "heading": {
          "en": "Ask your AI to use an app",
          "zh": "让 AI 使用应用"
        },
        "text": {
          "en": "In your connected AI chat, describe the result and name the app or account to use. For example: find a GitHub pull request and summarize its changes. In Apps, open an app's Tools tab to see supported actions and copy an instruction for your AI. Your AI client needs the matching Apps permissions. Only the listed actions are supported; availability also depends on your provider account.",
          "zh": "在已连接的 AI 聊天里说明结果，以及要使用的应用或账号。例如：查找一个 GitHub Pull Request 并总结变更。在 Apps 中打开应用的「工具」标签，查看支持的操作并复制给 AI 的指令。AI 客户端需要相应 Apps 权限；支持范围以工具列表为准，也取决于服务商账号。"
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
          "en": "Manage your connections",
          "zh": "管理账号连接"
        },
        "text": {
          "en": "Choose Available to find apps you can connect now, or Connected to manage existing accounts. An app marked Coming soon cannot be connected yet. Open Manage to check an account, reconnect when permissions are missing or access has expired, add another account, or disconnect. A successful connection check confirms account access; each action still needs its own provider permissions. Disconnecting removes the saved credential and prevents new actions through that connection.",
          "zh": "选择「可连接」查看现在可以接入的应用，或选择「已连接」管理已有账号。标注「即将推出」的应用暂不能连接。打开「管理」，可检查连接、在权限不足或授权过期时重新连接、添加其他账号或断开连接。连接检查成功表示账号可访问，具体操作仍需相应服务商权限。断开连接会移除保存的凭证，阻止通过此连接发起新操作。"
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
          "en": "Arc Chat is coming soon and is not open in this release. A task is one piece of work. A routine repeats on a schedule. In the upcoming Arc Chat, describe the result and timing; Arc asks for missing details and saves the work using a real tool. Tasks and Routines show status and results, without a configuration form. Connect remains your MCP connection layer for an external AI client.",
          "zh": "Arc Chat 即将上线，本次发布尚未开放。Task 是一次工作，Routine 按计划重复执行。未来在 Arc Chat 里描述结果和时间，Arc 会确认缺少的信息，再通过真实工具保存。Tasks 和 Routines 展示状态与结果，不需要配置表单。Connect 继续作为外部 AI 客户端使用的 MCP 连接层。"
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
          "en": "A Skill guides your AI through a workflow using the tools you have connected. It does not install software, create provider accounts or change device permissions. Check that the required app, device and tools are available before starting. If a required capability is unavailable, complete that setup first; a Skill alone cannot execute the action.",
          "zh": "Skill 指引 AI 使用已连接的工具完成工作，不会安装软件、创建服务商账号或改变设备权限。开始前请确认所需应用、设备和工具均可使用。缺少能力时先完成相应配置；仅有 Skill 指引无法执行操作。"
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
      "en": "Meet Arc, the upcoming personal agent for your apps and computers.",
      "zh": "了解即将推出的 Arc：连接应用与电脑的个人 Agent。"
    },
    "sections": [
      {
        "heading": {
          "en": "One platform, two ways to work",
          "zh": "一个平台，两种工作方式"
        },
        "text": {
          "en": "Connect brings your own AI client to apps and computers through MCP. Arc is the hosted personal-agent workspace on the same connections: chat, real tools, one-off tasks and routines. You do not supply a model API key. Check the workspace picker for availability: while Arc says Coming soon, Connect remains the available workspace.",
          "zh": "Connect 通过 MCP 把已有 AI 客户端连接到应用与电脑。Arc 是同一套连接之上的托管个人 Agent 工作空间，支持聊天、真实工具、一次性任务和 Routine，无需模型 API Key。开放状态以工作空间切换菜单为准：Arc 显示 Coming soon 时，仍可使用 Connect。"
        }
      },
      {
        "heading": {
          "en": "Auto and premium models",
          "zh": "Auto 与高级模型"
        },
        "text": {
          "en": "When Arc opens, Auto will choose a model for your work without asking you for a model API key. Paid plans will offer additional models, with availability and rates shown in Chat. Usage is measured in Credits: longer conversations, more agent steps and higher-priced models use more allowance. Check your remaining Credits and run limits before starting larger tasks.",
          "zh": "Arc 开放后，Auto 会为工作选择模型，无需你提供模型 API Key。付费套餐将提供更多模型，开放范围和费率会显示在 Chat 中。用量以 Credits 计量：更长的对话、更多执行步骤和更高价格的模型会消耗更多额度。开始较大任务前，可查看剩余额度和单次运行限制。"
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
          "en": "When Arc is available, activate the 14-day trial in Arc Chat. It includes 200 Credits and starts only when you confirm. Refreshing or activating again does not extend it. Daily, model and run caps still apply. At expiry, new hosted inference stops while existing results and connections remain. Connect uses its own allowance. No card is required and there is no automatic charge.",
          "zh": "Arc 开放后，可在 Arc Chat 主动确认开启 14 天试用，包含 200 Credits。刷新或再次开启不会延长试用；每日、模型和单次工作上限仍适用。到期后停止新的托管推理，已有结果和连接仍保留。Connect 使用独立额度，无需信用卡，也不会自动扣费。"
        }
      },
      {
        "heading":{"en":"Billing and allowance","zh":"账单与额度"},
        "text":{"en":"Settings → Billing shows your plan, available/reserved Credits, Connect calls and model rates. Monthly Credits expire at the paid period end; top-ups do not expire but require an active paid Arc subscription. Stripe handles checkout, payment methods, invoices and cancellation. Plan changes take effect at the next billing cycle. A checkout return page does not grant Credits until payment is verified. Refunds revoke unused purchased allowance; there are no automatic overage charges.","zh":"设置 → 账单显示套餐、可用与预留 Credits、Connect 调用和模型费率。套餐 Credits 在已付账期结束时到期；充值额度不设到期日，但使用时需有有效 Arc 付费订阅。Stripe 处理结账、付款方式、发票与取消订阅；套餐变更从下个账期生效。支付结果经核验后才发放额度，退款会撤销未使用的购买额度，不会自动收取超额费用。"}
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
      "en": "Understand your Remote Arc allowance and any separate app charges.",
      "zh": "了解 Remote Arc 额度，以及应用可能产生的独立费用。"
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
          "en": "Check the app's billing details",
          "zh": "查看应用的费用说明"
        },
        "text": {
          "en": "Each app's detail page explains whether an API account or separate paid plan is needed. Signing in with OAuth does not itself buy a provider subscription or add API credits. Some integrations also have shared service limits, so an action may be unavailable even when your personal account has allowance. Review the app's requirements and any usage limit shown before starting paid work.",
          "zh": "每个应用的详情页会说明是否需要 API 账号或单独付费套餐。OAuth 登录本身不会购买服务商订阅，也不会增加 API 积分。部分集成还受共享服务额度限制，即使个人账号尚有用量，操作也可能暂不可用。开始付费工作前，请查看应用要求和显示的用量限制。"
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
