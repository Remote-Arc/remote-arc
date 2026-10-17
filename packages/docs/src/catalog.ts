export type DocCopy = { en: string; zh: string };
export type DocTopic = { slug: string; group: "start" | "work" | "understand"; title: DocCopy; description: DocCopy; legacyIds?: string[]; sections?: { heading: DocCopy; text: DocCopy }[]; links?: string[][] };
export const DOC_TOPICS: DocTopic[] = [
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
    "slug": "apps",
    "group": "work",
    "title": {
      "en": "Apps and account connections",
      "zh": "Apps 与账号连接"
    },
    "description": {
      "en": "Connect cloud accounts independently of Arc Agent and review each write request.",
      "zh": "独立于 Arc Agent 连接云端账号，并审核每项写入请求。"
    },
    "sections": [
      {
        "heading": {
          "en": "Connect your own account",
          "zh": "连接自己的账号"
        },
        "text": {
          "en": "Open the App catalog, choose a category or integration, and check its connection availability and supported operations. When configured, Connect your account opens the signed-in Apps page. Choose read access or explicitly add write access. OAuth Apps redirect to the provider's consent screen; API credential Apps instead accept a key or access token from your own provider account. No local computer or Arc Agent is required for cloud App operations.",
          "zh": "打开应用目录，选择分类或应用，查看连接开放状态及支持的操作。配置完成的应用通过「连接你的账号」进入登录后的 Apps 页面。选择读取权限，或明确添加写入权限。OAuth 应用会跳转到平台授权页；API 凭证类应用使用你自己服务账号的密钥或访问令牌。云端 Apps 操作不需要本地电脑，也无需等待 Arc Agent。"
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
          "en": "Review writes and inspect results",
          "zh": "审核写入并检查结果"
        },
        "text": {
          "en": "A write requires apps:write, write permission on the connection and approval of the exact destination and payload in Apps. Check what will be sent or created before approving. Reuse the same requestId to collect its state. An uncertain external write is not automatically repeated. Provider acknowledgement means the API accepted the request; verify delivery or the final artifact at the provider when needed.",
          "zh": "写入需要 apps:write、连接的写入权限，以及你在 Apps 中对具体目标和内容的批准。批准前检查发送或创建的内容。使用同一个 requestId 查询状态；结果不明的外部写入不会自动重复。服务商确认表示 API 接受了请求，需要时仍应在平台检查最终内容或送达情况。"
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
      "en": "Save ongoing work, schedules and condition watches with explicit execution limits.",
      "zh": "保存持续工作、定时计划和条件监听，并设置执行边界。"
    },
    "legacyIds": [
      "automations",
      "continuation",
      "schedule"
    ],
    "links": [
      [
        "/docs/long-running-work",
        "Long-running work guide",
        "持续工作指南"
      ]
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
          "en": "Ask the AI to consult a relevant Skill, then discover the specific App or device operation it needs. Paid upstream APIs keep their own billing rules, and writes still need their normal approval. Future Arc teammates can share this foundation; the current Skill catalog does not make Arc Agent generally available.",
          "zh": "让 AI 先读取相关 Skill，再发现所需的具体 App 或设备操作。上游付费 API 仍按自己的规则计费，写入仍需要正常审批。未来 Arc 队友可复用这些基础，但当前技能库不代表 Arc Agent 已全面开放。"
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
          "en": "Connect and Arc",
          "zh": "Connect 与 Arc"
        },
        "text": {
          "en": "Connect brings tools, Apps and your paired devices into a compatible AI chat. That chat supplies the reasoning. Arc is the separate planned agent experience for persistent teammates and coordinated work. Arc Agent remains in development; Apps can ship and work through Connect independently.",
          "zh": "Connect 把工具、Apps 和已配对设备带入兼容的 AI 聊天，由该聊天提供推理。Arc 是独立推进的智能体体验，面向持久 AI 队友和协同工作。Arc Agent 仍在开发，Apps 可以独立发布并通过 Connect 工作。"
        }
      },
      {
        "heading": {
          "en": "Model provider foundation",
          "zh": "模型接入基础"
        },
        "text": {
          "en": "The hosted model gateway has adapters for Cloudflare Workers AI, OpenAI Responses and Claude Messages. They produce bounded planning decisions and do not execute tools themselves. Hosted inference is disabled by default. Supplying an API key does not enable a paid model: explicit provider grants and global, organization, user and task budgets are also required. There is no automatic paid fallback.",
          "zh": "托管模型网关已具备 Cloudflare Workers AI、OpenAI Responses 和 Claude Messages 适配器。它们输出有边界的规划决策，不直接执行工具。托管推理默认关闭；仅提供 API 密钥不会启用付费模型，还需要明确的服务商授权及全局、组织、用户和任务预算。系统不会自动回退到付费模型。"
        }
      },
      {
        "heading": {
          "en": "Persistent state and device control",
          "zh": "持久状态与设备控制"
        },
        "text": {
          "en": "Saved tasks retain their progress so another compatible chat can inspect state later. Device ownership, trusted paths, execution permissions, leases and approvals still apply. Organization membership does not grant access to another person's computer. A saved task is not a promise that an ordinary chat continues reasoning after it closes.",
          "zh": "保存的任务保留进度，之后可由另一个兼容聊天查看状态。设备归属、可信路径、执行权限、租约与审批仍然生效。加入组织不会获得其他人的电脑访问权。保存任务也不意味着普通聊天关闭后会继续推理。"
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
          "en": "A Runway generation shows its requested model, duration and estimated credits before approval. The estimate gate is not a provider-enforced financial cap. Ads APIs can expose spend on the connected advertising account; a report read and an ad purchase are different activities. Hosted Arc inference has a separate budget ledger and is not enabled by connecting Apps. Check current provider pricing and the account's billing controls.",
          "zh": "Runway 生成在审批前显示模型、时长和预估积分；预估限制不等于服务商强制执行的财务上限。广告 API 可能涉及所连接广告账号的支出，读取报表和购买广告是不同操作。托管 Arc 推理使用独立预算账本，不会随 Apps 连接而启用。请检查服务商现行价格与账号的计费控制。"
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
