// One click to let the AI use a site: Chrome then shows its own permission
// prompt for that site, and Remote Arc records it.
const params = new URLSearchParams(location.search);
const status = document.querySelector("#status");

function parseOrigin(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const zh = (navigator.language || "").toLowerCase().startsWith("zh");
const text = zh
  ? {
      title: "允许 AI 在这个网站上工作？",
      explain: "你的 AI 请求在你的浏览器里打开并使用这个网站，使用你已登录的状态。允许后，它可以在这个网站上打开标签页、读取页面、点击和填写。它看不到你的其他标签页和其他网站，Chrome 还会请你再确认一次。",
      once: "购买、发布和提交只会发送一次，AI 发送前应先征求你的同意。",
      secrets: "AI 从不输入密码和卡号。",
      revoke: "随时可以在 Remote Arc Browser 弹窗里移除这个网站。",
      allow: "允许",
      deny: "暂不",
      done: "已允许。可以关闭这个页面，让 AI 继续。",
      denied: "没有允许。AI 不会使用这个网站。",
      bad: "这个链接里的网站地址无效。",
    }
  : {
      title: "Allow your AI to work on this site?",
      done: "Allowed. You can close this page and let your AI continue.",
      denied: "Not allowed. Your AI will not use this site.",
      bad: "The site in this link is not valid.",
    };

if (zh) {
  document.documentElement.lang = "zh-CN";
  document.querySelector("#title").textContent = text.title;
  document.querySelector("#explain").textContent = text.explain;
  document.querySelector("#li-once").textContent = text.once;
  document.querySelector("#li-secrets").textContent = text.secrets;
  document.querySelector("#li-revoke").textContent = text.revoke;
  document.querySelector("#allow").textContent = text.allow;
  document.querySelector("#deny").textContent = text.deny;
}

const site = parseOrigin(params.get("origin") || "");
const allow = document.querySelector("#allow");
const deny = document.querySelector("#deny");

if (!site) {
  status.textContent = text.bad;
  allow.disabled = true;
} else {
  document.querySelector("#site").textContent = site.origin;
  document.title = site.hostname + " · Remote Arc";
}

allow.addEventListener("click", () => {
  if (!site) return;
  // Called directly from the click, as Chrome requires for its prompt.
  chrome.permissions.request({ origins: [site.protocol + "//" + site.hostname + "/*"] }).then(async (granted) => {
    if (!granted) {
      status.textContent = text.denied;
      return;
    }
    await chrome.runtime.sendMessage({ type: "site-allowed", origin: site.origin });
    status.textContent = text.done;
    allow.disabled = true;
    deny.disabled = true;
    setTimeout(() => window.close(), 1500);
  }, (error) => {
    status.textContent = error instanceof Error ? error.message : String(error);
  });
});

deny.addEventListener("click", () => {
  status.textContent = text.denied;
  setTimeout(() => window.close(), 800);
});
