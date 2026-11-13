import type { DocSection } from "../catalog.js";

export const memorySections: DocSection[] = [
  {
    heading: { en: "Within one conversation", zh: "同一对话内" },
    text: {
      en: "Arc saves the messages and execution observations of a conversation in your account. For each new step, a bounded selection of goals, arguments, results and connection IDs is passed to the model, not the entire history.",
      zh: "Arc 把对话中的消息和执行观察结果保存在你的账号里。每一步只会把有限的目标、参数、结果和连接 ID 交给模型，而不是整段历史。",
    },
    paragraphs: [
      {
        en: "Discovery results, such as a list of repositories, may be reused for a short time. An App action still checks its account’s current permissions when it runs.",
        zh: "发现类结果（例如仓库列表）可以短时间复用；应用动作在执行时仍会检查账号当前的权限。",
      },
      {
        en: "Very long conversations are shortened. When a detail matters, name the exact file, issue or goal again rather than relying on something said much earlier.",
        zh: "很长的对话会被缩短。如果某个细节很重要，请再次指明具体的文件、Issue 或目标，而不要依赖很久以前说过的话。",
      },
    ],
  },
  {
    heading: { en: "Across conversations", zh: "跨对话的记忆" },
    text: {
      en: "To have Arc remember a preference or a project fact, tell it to, or add it in Settings → Memory.",
      zh: "想让 Arc 记住某个偏好或项目事实，可以直接告诉它，或在设置 → 记忆中添加。",
    },
    list: {
      items: [
        {
          en: "Arc keeps short personal notes and bounded summaries of recent work in its own encrypted store. It does not rely on a model provider’s consumer chat memory.",
          zh: "Arc 在自己的加密存储中保留简短的个人笔记和有限的近期工作摘要，不依赖模型服务商消费级聊天产品的记忆功能。",
        },
        {
          en: "Only notes relevant to a request are retrieved for it.",
          zh: "每次请求只取用与它相关的笔记。",
        },
        {
          en: "Live device status always comes from the device registry. A remembered computer name is not proof that the computer is online or authorized.",
          zh: "设备的实时状态始终来自设备注册信息。记住了某台电脑的名字，并不代表它在线或已获授权。",
        },
      ],
    },
  },
  {
    heading: { en: "See, edit and delete", zh: "查看、修改与删除" },
    text: {
      en: "Settings → Memory lists what is saved. You can edit a personal fact, remove an entry or turn memory off.",
      zh: "设置 → 记忆中列出已保存的内容。你可以修改个人事实、删除条目或关闭记忆功能。",
    },
    paragraphs: [
      {
        en: "Memory and chat history have separate controls, and deleting a note does not delete the original data at an App provider. Only the context relevant to a request is sent to the selected model’s API, under that provider’s processing terms.",
        zh: "记忆和聊天历史分别控制；删除一条笔记不会删除应用服务商处的原始数据。只有与请求相关的上下文会发送给所选模型的 API，并受该服务商的处理条款约束。",
      },
    ],
    note: {
      en: "Do not store passwords or API keys in memory.",
      zh: "不要在记忆中保存密码或 API Key。",
    },
  },
];
