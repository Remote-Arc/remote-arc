import type { DocSection } from "../catalog.js";

export const installAppSections: DocSection[] = [
  {
    heading: { en: "Install Remote Arc as an app", zh: "把 Remote Arc 安装为应用" },
    text: {
      en: "The web app opens your Remote Arc workspace in its own window, without browser tabs around it. It is the same site as agent.remotearc.app, installed through your browser.",
      zh: "网页应用会在独立窗口中打开 Remote Arc 工作空间，周围没有浏览器标签栏。它就是 agent.remotearc.app，只是通过浏览器安装成了应用。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Open agent.remotearc.app and sign in.",
          zh: "打开 agent.remotearc.app 并登录。",
        },
        {
          en: "Choose Install in Profile settings, or use your browser’s own install option (see the next section).",
          zh: "在个人资料设置中选择安装，或使用浏览器自带的安装入口（见下一节）。",
        },
        {
          en: "Open the installed app. Use Arc Chat for your personal agent, or switch to Connect for devices, App connections and activity.",
          zh: "打开安装好的应用。使用 Arc Chat 和个人智能体对话，或切换到 Connect 查看设备、应用连接和活动。",
        },
        {
          en: "To use Arc, activate the Auto trial or choose Pro / Max in Plan & usage.",
          zh: "要使用 Arc，在“套餐与用量”中开启 Auto 试用或选择 Pro / Max。",
        },
      ],
    },
  },
  {
    heading: { en: "Where the install option is", zh: "各设备上的安装入口" },
    text: {
      en: "Each browser offers installation in a different place, and the option only appears where the browser supports it.",
      zh: "不同浏览器的安装入口位置不同，只有在浏览器支持时才会出现。",
    },
    list: {
      items: [
        {
          en: "Chrome and Edge on a computer: Install app, from the address bar or the browser menu.",
          zh: "电脑上的 Chrome 和 Edge：地址栏或浏览器菜单中的“安装应用”。",
        },
        {
          en: "iPhone and iPad: Share → Add to Home Screen.",
          zh: "iPhone 和 iPad：分享 → 添加到主屏幕。",
        },
        {
          en: "Safari on a Mac: File → Add to Dock.",
          zh: "Mac 上的 Safari：文件 → 添加到程序坞。",
        },
      ],
    },
  },
  {
    heading: { en: "What the installed app changes", zh: "安装后有什么不同" },
    text: {
      en: "The installed app uses the same account and settings as the website. Nothing is stored only in the app, and signing out works the same way.",
      zh: "安装后的应用沿用网站的账号和设置，没有只保存在应用里的数据，退出登录的方式也一样。",
    },
    paragraphs: [
      {
        en: "You need an internet connection to see current activity and use tools. If you go offline, reconnect to continue.",
        zh: "查看实时活动和使用工具都需要联网；离线后重新连接即可继续。",
      },
      {
        en: "Closing the web app does not stop the local Agent on a paired computer. The Agent keeps its own connection, which you manage from Devices.",
        zh: "关闭网页应用不会停止已配对电脑上的本机 Agent。Agent 有自己的连接，在设备页面管理。",
      },
    ],
  },
];
