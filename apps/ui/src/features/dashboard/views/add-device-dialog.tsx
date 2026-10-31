import { useEffect, useRef, useState } from "react";
import { MARKETING_ORIGIN } from "../../../config/app-config.js";
import { CopyButton } from "../../../components/public-layout.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";

type Platform = "darwin" | "windows" | "linux";
const CURL = "curl -fsSL https://remotearc.app/install.sh | sh";

// The computer being paired is usually the one showing this page.
function currentPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /win/i.test(value) ? "windows" : /linux|x11|cros/i.test(value) && !/android/i.test(value) ? "linux" : "darwin";
}

function Command({ value }: { value: string }) {
  return <div className="commandBox"><code>{value}</code><CopyButton value={value} /></div>;
}

export function AddDeviceDialog({ m }: { m: DashboardModel }) {
  const { command, locale, setShowAdd, tr } = m;
  const [platform, setPlatform] = useState<Platform>(currentPlatform);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setShowAdd(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShowAdd]);
  const site = MARKETING_ORIGIN + (locale === "zh" ? "/zh" : "");
  const download = (arch: string) => MARKETING_ORIGIN + "/api/downloads/agent/" + platform + "/" + arch;
  const tabs: [Platform, string][] = [["darwin", "macOS"], ["windows", "Windows"], ["linux", "Linux"]];
  const npx = <>
    <div className="commandLabel secondary">{tr("With Node.js 20+ installed", "已安装 Node.js 20+ 时")}</div>
    <Command value={command} />
  </>;
  return (
    <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
      <section className="modal addDeviceModal" role="dialog" aria-modal="true" aria-labelledby="add-device-title" onMouseDown={(event) => event.stopPropagation()}>
        <button ref={close} className="modalClose" aria-label={tr("Close", "关闭")} onClick={() => setShowAdd(false)}>×</button>
        <span className="eyebrow">{tr("ADD A DEVICE", "添加设备")}</span>
        <h2 id="add-device-title">{tr("Connect a computer", "连接一台电脑")}</h2>
        <p>{tr("Run the Remote Arc Agent on the computer you want your AI to use. No public IP, port forwarding or token copying. New devices start with read-only skills enabled.", "在你希望 AI 使用的电脑上运行 Remote Arc Agent。无需公网 IP、端口映射或复制 Token。新设备默认只开启只读技能。")}</p>
        <div className="addDevicePlatforms" role="tablist" aria-label={tr("Operating system", "操作系统")}>
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={platform === id} onClick={() => setPlatform(id)}>
            <img src={"/platform-brands/" + (id === "darwin" ? "macos" : id) + ".svg"} width="18" height="18" alt="" />{label}
          </button>)}
        </div>
        <div className="addDevicePanel" role="tabpanel">
          {platform === "windows" ? <>
            <div className="commandLabel">{tr("Recommended · Download the installer", "推荐 · 下载安装程序")}</div>
            <div className="addDeviceDownloads">
              <a className="addButton" href={download("amd64")}>{tr("Download for Windows x64", "下载 Windows x64 版")}</a>
              <a className="ghostButton" href={download("arm64")}>ARM64</a>
            </div>
            <small className="addDeviceHint">{tr("Run the downloaded .exe. Most Intel and AMD PCs need x64.", "运行下载的 .exe。大多数 Intel 和 AMD 电脑选 x64。")}</small>
            {npx}
            <small className="addDeviceHint">{tr("Run it in PowerShell or Windows Terminal.", "在 PowerShell 或 Windows 终端中运行。")}</small>
          </> : <>
            <div className="commandLabel">{tr("Recommended · No Node.js needed", "推荐 · 无需 Node.js")}</div>
            <Command value={CURL} />
            <small className="addDeviceHint">{tr("Installs the native Agent and verifies it, without sudo. Then start it:", "安装并校验原生 Agent，无需 sudo。完成后启动：")}</small>
            <Command value="remotelink" />
            {npx}
            <a className="addDeviceMore" href={site + "/downloads" + (platform === "darwin" ? "#homebrew" : "#native-downloads")} target="_blank" rel="noopener noreferrer">{platform === "darwin" ? tr("Homebrew or direct download", "Homebrew 或直接下载") : tr("Direct download (x64 / ARM64)", "直接下载（x64 / ARM64）")} →</a>
          </>}
        </div>
        <details className="addDeviceSafe">
          <summary>{tr("Optional · Keep this computer read-only", "可选 · 让这台电脑保持只读")}</summary>
          <p>{tr("Add --safe when starting the Agent, for example npx remotelink --safe or remotelink --safe. The computer keeps a local read-only ceiling that the dashboard cannot raise.", "启动 Agent 时加上 --safe，例如 npx remotelink --safe 或 remotelink --safe。这台电脑会保持本机只读上限，控制台无法远程放开。")}</p>
        </details>
        <div className="onboardingSteps">
          <div><b>1</b><span><strong>{tr("Start the Agent", "启动 Agent")}</strong><small>{tr("Your browser opens the pairing page. If it does not, open the link shown in the terminal.", "浏览器会打开配对页面；没有自动打开时，打开终端里显示的链接。")}</small></span></div>
          <div><b>2</b><span><strong>{tr("Match the code and choose permissions", "核对配对码并选择权限")}</strong><small>{tr("Sign in with this same Remote Arc account.", "使用当前这个 Remote Arc 账号登录。")}</small></span></div>
          <div><b>3</b><span><strong>{tr("It appears here", "电脑会出现在这里")}</strong><small>{tr("Keep the Agent running, then connect your AI client.", "保持 Agent 运行，然后连接你的 AI 客户端。")}</small></span></div>
        </div>
      </section>
    </div>
  );
}
