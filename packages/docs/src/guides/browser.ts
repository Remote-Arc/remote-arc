import type { DocSection } from "../catalog.js";

export const browserSections: DocSection[] = [
  {
    heading: { en: "Two ways to give AI a browser", zh: "让 AI 使用浏览器的两种方式" },
    text: {
      en: "Remote Arc offers two separate browser connections. They use different tools and different device IDs, which cannot be swapped.",
      zh: "Remote Arc 提供两种相互独立的浏览器连接，它们使用不同的工具和不同的设备 ID，不能混用。",
    },
    list: {
      items: [
        {
          en: "Browser Runner (browser_runner_* tools) runs on a paired computer with installed Chrome, Edge or Chromium. Use it for delegated, multi-step website tasks such as filling in an application.",
          zh: "Browser Runner（browser_runner_* 工具）在已配对电脑上，使用本机安装的 Chrome、Edge 或 Chromium。适合委托的多步骤网站任务，例如填写一份申请。",
        },
        {
          en: "The Remote Arc browser extension (shared_tab_* tools) works inside your everyday Chrome, on sites you allow or a tab you share. Use it when the work needs the browser you are already signed in to.",
          zh: "Remote Arc 浏览器扩展（shared_tab_* 工具）在你日常使用的 Chrome 里工作，仅限你允许的网站或你共享的标签页。适合需要用到你已登录浏览器的工作。",
        },
      ],
    },
  },
  {
    heading: { en: "Set up Browser Runner", zh: "设置 Browser Runner" },
    text: {
      en: "Browser Runner is a per-computer permission. Turn it on in that computer’s device permissions in the Dashboard, and keep its Agent running.",
      zh: "Browser Runner 是按电脑开启的权限。在 Dashboard 中该电脑的设备权限里打开它，并保持 Agent 运行。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "The AI starts a task with browser_runner_start, giving a task_id, the allowed_origins for the sites the task may visit, and optionally a profile name.",
          zh: "AI 用 browser_runner_start 开始任务，提供 task_id、任务可访问网站的 allowed_origins，并可选填 profile 名称。",
        },
        {
          en: "By default the Runner uses its own persistent browser profile and keeps the window out of sight. Reusing the same profile for the same person keeps their sign-ins between tasks.",
          zh: "默认情况下，Runner 使用独立且可保留登录状态的浏览器资料，窗口在后台不可见。同一个人复用同一份 profile，可以在不同任务之间保留登录状态。",
        },
        {
          en: "The AI reads the page with browser_runner_snapshot and acts with browser_runner_act: fill, click, navigate, upload and other actions, using element references from the latest snapshot.",
          zh: "AI 用 browser_runner_snapshot 读取页面，用 browser_runner_act 操作：填写、点击、跳转、上传等，使用最新快照中的元素引用。",
        },
      ],
    },
    note: {
      en: "Allowed sites never widen because of instructions on a web page. Adding a site needs the owner’s explicit approval, and forms embedded from another site need that site named too.",
      zh: "允许的网站范围不会因为网页上的指令而扩大。新增网站需要所有者明确批准；嵌入在页面中的其他网站的表单，也需要单独列出该网站。",
    },
  },
  {
    heading: { en: "Sign-in, verification codes and CAPTCHAs", zh: "登录、验证码与 CAPTCHA" },
    text: {
      en: "Remote Arc does not automate authentication. Sign-in, verification codes, CAPTCHAs and payment details are always completed by you; saved approvals cannot turn this on.",
      zh: "Remote Arc 不会自动完成身份验证。登录、验证码、CAPTCHA 和支付信息始终由你本人完成，任何已保存的批准都无法开启自动处理。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "After a submission or navigation, the Agent checks the page for a sign-in or verification blocker and notifies you. Hidden or inactive CAPTCHA assets do not count as a pending challenge.",
          zh: "提交或跳转之后，Agent 会检查页面上是否有登录或验证阻碍，并通知你。隐藏或未激活的 CAPTCHA 资源不算作待处理的验证。",
        },
        {
          en: "Open the existing task window. Whether it appears on its own follows your notification preferences and whether you are at the computer; scheduled Arc runs only notify.",
          zh: "打开现有的任务窗口。它是否自动显示，取决于你的通知偏好以及你是否在电脑前；定时运行的 Arc 任务只发通知。",
        },
        {
          en: "Complete the step yourself, then the AI resumes the same task_id. browser_runner_wait can wait up to 40 seconds for you to finish, or for a page, upload or network condition.",
          zh: "自己完成这一步，AI 再用同一个 task_id 继续。browser_runner_wait 可以最多等待 40 秒，等你完成操作，或等待页面、上传或网络条件满足。",
        },
      ],
    },
    paragraphs: [
      {
        en: "While you are watching in the Dashboard, an owner-only live view shows the task’s page. It is view-only and does not accept remote input. A computer without a display cannot provide this local handoff.",
        zh: "你在 Dashboard 查看时，有一个仅所有者可见的实时画面展示任务页面。它只能看，不能远程输入。没有显示器环境的电脑无法提供这种本机交接。",
      },
    ],
  },
  {
    heading: { en: "Uploads and final submissions", zh: "上传与最终提交" },
    text: {
      en: "The Runner can attach files from a trusted location on the computer, up to a size limit per type:",
      zh: "Runner 可以上传电脑上可信目录中的文件，不同类型有各自的大小上限：",
    },
    list: {
      items: [
        {
          en: "Documents and images (pdf, doc, docx, txt, rtf, odt, csv, xlsx, pptx, png, jpg, gif, webp): up to 25 MB.",
          zh: "文档和图片（pdf、doc、docx、txt、rtf、odt、csv、xlsx、pptx、png、jpg、gif、webp）：最大 25 MB。",
        },
        { en: "Audio (mp3, wav, m4a): up to 512 MB.", zh: "音频（mp3、wav、m4a）：最大 512 MB。" },
        {
          en: "Video (mp4, mov, m4v, webm): up to 2 GB.",
          zh: "视频（mp4、mov、m4v、webm）：最大 2 GB。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Other types are rejected with UNSUPPORTED_UPLOAD_TYPE, and oversized files with UPLOAD_SIZE_LIMIT. A file that exists on the computer does not mean the website accepted it, so check the page afterwards.",
        zh: "其他类型会以 UNSUPPORTED_UPLOAD_TYPE 拒绝，超出大小的文件会以 UPLOAD_SIZE_LIMIT 拒绝。文件存在于电脑上不代表网站已经接受上传，事后请检查页面。",
      },
      {
        en: "A final submit, such as sending an application, needs effect=submit and a stable idempotency_key, and the result is confirmed with browser_runner_confirm against what the page shows. An unknown or unverified outcome is never a reason to submit again.",
        zh: "最终提交（例如发送申请）需要 effect=submit 和稳定的 idempotency_key，结果用 browser_runner_confirm 对照页面实际显示来确认。结果未知或未核实，绝不是再次提交的理由。",
      },
    ],
    note: {
      en: "A custom browser-automation script run as a command bypasses the Runner’s handoff and submit tracking.",
      zh: "以命令方式运行的自定义浏览器自动化脚本，会绕开 Runner 的交接和提交追踪。",
    },
  },
  {
    heading: { en: "Use the Chrome you already have", zh: "使用你已有的 Chrome" },
    text: {
      en: "Runner normally uses its own profile. If you ask for it, a task can instead open its own window in your everyday Chrome (browser=your_chrome) and use your existing sign-ins. This is an advanced option.",
      zh: "Runner 通常使用自己的资料。如果你明确要求，任务也可以在你日常使用的 Chrome 中打开自己的窗口（browser=your_chrome），使用你现有的登录状态。这是高级选项。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Use Chrome 144 or later. Open chrome://inspect/#remote-debugging and enable Allow remote debugging for this browser instance.",
          zh: "使用 Chrome 144 或更高版本。打开 chrome://inspect/#remote-debugging，开启 Allow remote debugging for this browser instance。",
        },
        {
          en: "Start the task with browser=your_chrome. Chrome asks you to click Allow for each new connection and shows a control banner while connected.",
          zh: "用 browser=your_chrome 开始任务。每建立一个新连接，Chrome 都会要求你点击允许，连接期间会显示控制横幅。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Several tasks share one connection. Closing a task closes only its own tab; your other tabs and your Chrome profile are kept.",
        zh: "多个任务共用一个连接。关闭任务只会关闭它自己的标签页，你的其他标签页和 Chrome 资料都会保留。",
      },
    ],
  },
  {
    heading: { en: "The browser extension", zh: "浏览器扩展" },
    text: {
      en: "The Remote Arc browser extension lets your AI work in your own Chrome. Install it from the browser extension page, open its popup, choose Connect to Remote Arc and approve the pairing.",
      zh: "Remote Arc 浏览器扩展让 AI 在你自己的 Chrome 里工作。在浏览器扩展页面安装，打开弹窗，选择连接 Remote Arc 并批准配对。",
    },
    list: {
      items: [
        {
          en: "Allowed sites: allow a site once, from the popup or when the AI asks for it. The AI can then open tabs there with shared_tab_open and act with shared_tab_act: click, fill, select, press keys, scroll, navigate, wait and fill whole forms, signed in as you are.",
          zh: "允许的网站：在弹窗中，或在 AI 请求时，允许某个网站一次。之后 AI 可以用 shared_tab_open 在该网站打开标签页，用 shared_tab_act 点击、填写、选择、按键、滚动、跳转、等待和整表填写，使用你现有的登录状态。",
        },
        {
          en: "Shared tabs: share one tab you have open. It starts read-only; turn on Click & fill for that tab when it needs interaction.",
          zh: "共享标签页：共享一个你打开的标签页。它默认只读，需要操作时再为该标签页开启“点击与填写”。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Orders, payments, posts, comments, messages and submissions are final submits: they need effect=submit and an idempotency_key, and the same form cannot be sent again under a new key until the earlier one is confirmed. Password, payment-card and file-picker fields are never filled.",
        zh: "下单、付款、发帖、评论、发消息和提交都属于最终提交：需要 effect=submit 和 idempotency_key，在之前那次被确认之前，同一表单不能换一个新 key 再次发送。密码、银行卡和文件选择字段永远不会被填写。",
      },
      {
        en: "When the AI needs an API key or token, request_secret asks you to enter it on a Remote Arc page instead of in the chat. The AI receives only a one-time handle, which can be filled once on the named site or passed to a command’s input.",
        zh: "当 AI 需要 API Key 或令牌时，request_secret 会请你在 Remote Arc 页面上输入，而不是发在聊天里。AI 只拿到一个一次性引用，可以在指定网站上填写一次，或作为命令的输入使用。",
      },
    ],
    note: {
      en: "The extension is an unpacked beta, not a Chrome Web Store extension, and does not update itself. The Dashboard’s Devices page shows when a newer version is available.",
      zh: "扩展目前是需解压加载的 Beta 版，不在 Chrome 网上应用店上架，也不会自动更新。Dashboard 的设备页面会提示新版本。",
    },
  },
];
