import type { DocSection } from "../catalog.js";

export const computerUseSections: DocSection[] = [
  {
    heading: { en: "What computer use does", zh: "Computer Use 能做什么" },
    text: {
      en: "Computer use lets your AI see the screen of a paired computer and use its mouse and keyboard, the way a person would. It finishes the steps that live in a desktop app with no API, command line or file to work through, and it does what you ask in any app you name.",
      zh: "Computer Use（桌面控制）让你的 AI 看到已配对电脑的屏幕，并像人一样使用鼠标和键盘。它负责那些只能在桌面应用里完成、没有 API、命令行或文件可用的步骤，也可以按你的要求操作你指定的任何应用。",
    },
    list: {
      items: [
        {
          en: "desktop_snapshot returns a screenshot of one display, the visible windows and, on Windows, the controls of the window in front, each with a reference the AI can click.",
          zh: "desktop_snapshot 返回一个显示器的截图和可见窗口列表；在 Windows 上还会返回前台窗口的控件，每个控件都有 AI 可以直接点击的引用。",
        },
        {
          en: "desktop_act clicks, double-clicks, scrolls, drags, types text, presses key combinations such as Ctrl+S, or brings a window to the front, on the screen the AI last looked at.",
          zh: "desktop_act 在 AI 最近一次看到的屏幕上点击、双击、滚动、拖动、输入文字、按组合键（如 Ctrl+S），或把某个窗口切到前台。",
        },
        {
          en: "It works with ChatGPT, Claude, Gemini, Cursor and any MCP client that shows images, on the computers you pair, wherever you are.",
          zh: "它适用于 ChatGPT、Claude、Gemini、Cursor 以及任何能显示图片的 MCP 客户端，可以操作你配对的任意一台电脑，不论你人在哪里。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Files, commands, Apps and Browser Runner are faster and easier to verify, so your AI uses them first and keeps computer use for the steps nothing else can reach.",
        zh: "文件、命令、Apps 和 Browser Runner 更快，也更容易核对结果，所以 AI 会优先使用它们，只有其他工具做不到的步骤才用 Computer Use。",
      },
    ],
  },
  {
    heading: { en: "Turn it on for a computer", zh: "为一台电脑开启" },
    text: {
      en: "Computer use is included with Pro and Max, and the Pro trial. It is a separate permission for each computer, and it is off until you turn it on.",
      zh: "Computer Use 包含在 Pro 和 Max 套餐（以及 Pro 试用）中。它是每台电脑单独的权限，在你开启之前一直是关闭的。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Update the Remote Arc Agent on a Windows 10 (version 1607 or later) or Windows 11 computer, or on Linux signed in to an X11 (Xorg) session. Wayland sessions are not supported yet.",
          zh: "在 Windows 10（1607 或更高版本）、Windows 11，或登录在 X11（Xorg）会话下的 Linux 电脑上，把 Remote Arc Agent 更新到最新版本。暂不支持 Wayland 会话。",
        },
        {
          en: "In the Dashboard, open Devices, choose the computer and turn on Desktop control. The Developer and Full presets also turn it on; Safe turns it off.",
          zh: "在 Dashboard 中打开“设备”，选择这台电脑并开启“桌面控制”。Developer 和 Full 预设也会开启它，Safe 预设会关闭它。",
        },
        {
          en: "Ask your AI to look at that computer's screen, for example: “Take a screenshot of my office PC and tell me which apps are open.”",
          zh: "让 AI 查看那台电脑的屏幕，例如：“截一张我办公室电脑的屏幕，告诉我开着哪些应用。”",
        },
      ],
    },
    note: {
      en: "Computer use reaches as far as terminal access: the AI could open a terminal and type a command. Turn it on only for computers where you would allow that.",
      zh: "Computer Use 的权限和终端一样大：AI 可以打开终端并输入命令。只在你允许这样做的电脑上开启。",
    },
  },
  {
    heading: { en: "You stay in control", zh: "控制权始终在你" },
    text: {
      en: "The person at the computer always wins. Remote Arc enforces these rules on the computer itself, whatever the AI asks for.",
      zh: "坐在电脑前的人永远优先。这些规则由电脑上的 Agent 强制执行，不管 AI 请求什么。",
    },
    list: {
      items: [
        {
          en: "A bar at the top of the screen says when AI is viewing or using the computer. It never appears in the screenshots.",
          zh: "AI 查看或使用电脑时，屏幕顶部会显示一条提示，提示条本身不会出现在截图里。",
        },
        {
          en: "Move the mouse or press any key and the AI stops at once. It waits until the computer has been quiet for a few seconds and takes a new screenshot before it continues.",
          zh: "你一动鼠标或按任意键，AI 会立刻停下，等电脑安静几秒并重新截图后才会继续。",
        },
        {
          en: "Typing is refused when a different window came to the front since the screenshot, so keys never land in a window the AI has not seen.",
          zh: "如果截图后前台换成了别的窗口，输入会被拒绝，按键永远不会落到 AI 没看到的窗口里。",
        },
        {
          en: "Password managers, keyring and polkit prompts, screen lockers and Windows security and sign-in windows are painted over in screenshots, their titles and controls are never read, and they never receive input. Password fields never report their value.",
          zh: "密码管理器、密钥环和 polkit 授权提示、锁屏程序，以及 Windows 安全和登录窗口在截图中会被遮住，不会读取它们的标题和控件，也不会向它们发送任何输入。密码框永远不会返回内容。",
        },
        {
          en: "A locked computer, the lock screen and UAC prompts are refused. Each screenshot can be acted on for two minutes.",
          zh: "电脑锁定、显示锁屏或 UAC 提示时会拒绝操作。每张截图的有效期是两分钟。",
        },
        {
          en: "Computer use runs only in a conversation with your own AI client. Routines, Arc runs and file links cannot use it, because nobody would be there to take over.",
          zh: "Computer Use 只能在你自己的 AI 客户端对话中使用。例行任务、Arc 运行和文件链接都不能使用，因为那时没有人能随时接管。",
        },
      ],
    },
  },
  {
    heading: { en: "What is sent and stored", zh: "发送和保存的内容" },
    text: {
      en: "Screenshots and the text of controls pass through Remote Arc to the AI provider you chose, like the output of any other tool. Remote Arc does not store screenshots.",
      zh: "截图和控件文字会像其他工具的结果一样，经过 Remote Arc 发送给你选择的 AI 服务商。Remote Arc 不保存截图。",
    },
    list: {
      items: [
        {
          en: "Audit records name the tool, the computer, the time and the outcome, never the screenshot or the text typed.",
          zh: "审计记录只包含工具名、电脑、时间和结果，不包含截图或输入的文字。",
        },
        {
          en: "A screenshot is a JPEG of up to 1,920 pixels wide and 1.5 MB, so it costs your AI client context like any image.",
          zh: "截图是最宽 1920 像素、最大 1.5 MB 的 JPEG，会像其他图片一样占用 AI 客户端的上下文。",
        },
      ],
    },
  },
  {
    heading: { en: "Limits", zh: "限制" },
    text: {
      en: "Each step is a screenshot, a decision by the model and an action, which takes a few seconds. That suits forms, settings and office apps, not anything that needs fast reactions.",
      zh: "每一步都是“截图、模型判断、执行操作”，需要几秒钟。适合表单、设置和办公软件，不适合需要快速反应的事情。",
    },
    list: {
      items: [
        {
          en: "Windows does not let a normal program send input to an app running as administrator. Ask the user to do that step, or run the app normally.",
          zh: "Windows 不允许普通程序向以管理员身份运行的应用发送输入。这一步请用户自己完成，或以普通权限运行该应用。",
        },
        {
          en: "Games with anti-cheat software block simulated input, and automating them can break their terms and get an account banned. Do not use computer use for them.",
          zh: "带反作弊的游戏会拦截模拟输入，自动化操作还可能违反游戏条款、导致封号。不要用 Computer Use 玩这类游戏。",
        },
        {
          en: "Web pages are better handled by Browser Runner, which reads the page itself and never sends a form twice.",
          zh: "网页更适合交给 Browser Runner，它直接读取网页内容，并且不会重复提交表单。",
        },
        {
          en: "A screenshot shows one display; the AI can ask for another. On Linux the AI works from the screenshot and the window list, without the controls of the window in front. macOS support is planned.",
          zh: "一张截图只包含一个显示器，AI 可以指定其他显示器。在 Linux 上，AI 依靠截图和窗口列表操作，不读取前台窗口的控件。macOS 支持正在计划中。",
        },
      ],
    },
  },
  {
    heading: { en: "When the AI is refused", zh: "AI 被拒绝时" },
    text: {
      en: "Every refusal starts with a code the AI can act on.",
      zh: "每次拒绝都以一个错误码开头，AI 可以据此处理。",
    },
    list: {
      items: [
        {
          en: "TOOL_DISABLED: computer use is off for that computer. Turn it on in the Dashboard.",
          zh: "TOOL_DISABLED：这台电脑没有开启 Computer Use，请在 Dashboard 中开启。",
        },
        {
          en: "DESKTOP_USER_ACTIVE and DESKTOP_USER_TOOK_OVER: the person is using the computer. The AI waits, then takes a new screenshot.",
          zh: "DESKTOP_USER_ACTIVE 和 DESKTOP_USER_TOOK_OVER：有人正在使用这台电脑，AI 会等待，然后重新截图。",
        },
        {
          en: "DESKTOP_FOCUS_CHANGED and DESKTOP_STALE_SNAPSHOT: the screen changed. The AI takes a new screenshot.",
          zh: "DESKTOP_FOCUS_CHANGED 和 DESKTOP_STALE_SNAPSHOT：屏幕已经变化，AI 会重新截图。",
        },
        {
          en: "DESKTOP_APP_BLOCKED: the step is in a password manager or a security prompt. The person does it.",
          zh: "DESKTOP_APP_BLOCKED：这一步在密码管理器或安全提示里，需要人来完成。",
        },
        {
          en: "DESKTOP_LOCKED, DESKTOP_UNSUPPORTED and DESKTOP_UNATTENDED_UNSUPPORTED: the computer is locked, cannot offer computer use, or nobody is in the conversation.",
          zh: "DESKTOP_LOCKED、DESKTOP_UNSUPPORTED 和 DESKTOP_UNATTENDED_UNSUPPORTED：电脑已锁定、不支持 Computer Use，或当前不是用户本人的对话。",
        },
      ],
    },
  },
];
