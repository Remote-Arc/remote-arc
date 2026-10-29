import React, { useEffect } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./public-docs.css";
import "./native-install.css";

const release = "https://github.com/Remote-Arc/remote-arc/releases/latest";
const platforms = [
  { id: "darwin", icon: "macos", name: "macOS", choices: [
    { arch: "arm64", label: "Apple Silicon", detail: "ARM64" },
    { arch: "amd64", label: "Intel", detail: "x64" },
  ] },
  { id: "windows", icon: "windows", name: "Windows", choices: [
    { arch: "amd64", label: "x64", detail: "Intel / AMD" },
    { arch: "arm64", label: "ARM64", detail: "ARM" },
  ] },
  { id: "linux", icon: "linux", name: "Linux", choices: [
    { arch: "amd64", label: "x64", detail: "Intel / AMD" },
    { arch: "arm64", label: "ARM64", detail: "ARM" },
  ] },
] as const;

function DownloadIcon() {
  return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 13v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function NativeInstall() {
  const { tr, locale } = useI18n();
  useEffect(() => {
    let frame: number | undefined;
    const alignFragment = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hash = window.location.hash;
        if (["#homebrew", "#shell-install", "#native-downloads"].includes(hash)) {
          const target = document.getElementById(hash.slice(1));
          if (target instanceof HTMLDetailsElement) target.open = true;
          target?.scrollIntoView({ block: "start" });
        }
      });
    };
    alignFragment();
    window.addEventListener("hashchange", alignFragment);
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); window.removeEventListener("hashchange", alignFragment); };
  }, []);

  return <section id="agent-downloads" className="nativeInstall">
    <header className="nativeInstallHeader">
      <span className="eyebrow">REMOTE ARC · {tr("LATEST STABLE", "最新稳定版")}</span>
      <h1>{tr("Download Remote Arc", "下载 Remote Arc")}</h1>
      <p>{tr("Choose your computer. Download the native Agent, run it, and approve pairing in your browser. No Node.js required.", "选择你的电脑系统。下载并运行原生 Agent，再到浏览器批准配对，无需安装 Node.js。")}</p>
    </header>

    <ul id="native-downloads" className="nativeDownloads">
      {platforms.map(platform => <li key={platform.id} className="nativeDownloadCard">
        <div className="nativeDownloadHeading">
          <span className="nativePlatformIcon"><img src={`/platform-brands/${platform.icon}.svg`} width="32" height="32" alt="" /></span>
          <div><h2>{platform.name}</h2><span>{tr("Native Agent", "原生 Agent")}</span></div>
        </div>
        <div className="nativeDownloadChoices">{platform.choices.map(choice => <a key={choice.arch}
          href={`/api/downloads/agent/${platform.id}/${choice.arch}`}
          aria-label={tr(`Download for ${platform.name} ${choice.label}`, `下载 ${platform.name} ${choice.label}`)}>
          <span><strong>{choice.label}</strong><small>{choice.detail}</small></span><DownloadIcon />
        </a>)}</div>
      </li>)}
    </ul>
    <div className="nativeDownloadMeta">
      <span>{tr("Every download follows the latest stable release.", "每次下载均获取最新稳定版。")}</span>
      <div><a href={release + "/download/SHA256SUMS"}>SHA256SUMS</a><span aria-hidden="true">·</span><a href={release}>{tr("Release notes", "发布说明")}</a></div>
    </div>

    <section className="nativeInstallStart">
      <h2>{tr("Run the Agent, then pair your computer", "运行 Agent，配对你的电脑")}</h2>
      <p>{tr("Use the same Remote Arc account you connected in ChatGPT. Once your computer appears online, return to your conversation. If it is already paired, start your existing Agent.", "使用你在 ChatGPT 中连接的同一个 Remote Arc 账号。电脑显示在线后，即可回到聊天继续。已经配对过的电脑，启动原来的 Agent 即可。")}</p>
      <div className="nativeStartGuides">
        <details><summary><img src="/platform-brands/macos.svg" width="20" height="20" alt="" />{tr("Starting on macOS", "macOS 启动说明")}</summary>
          <ol><li>{tr("Open Terminal. Type chmod +x followed by a space, drag the downloaded file into Terminal, then press Return.", "打开终端，输入 chmod +x 后加一个空格，把下载的文件拖入终端，再按回车。")}</li><li>{tr("Drag the same file into Terminal again and press Return to start the Agent. Follow the browser pairing page.", "再将同一文件拖入终端并按回车，启动 Agent，按浏览器页面完成配对。")}</li></ol>
        </details>
        <details><summary><img src="/platform-brands/windows.svg" width="20" height="20" alt="" />{tr("Starting on Windows", "Windows 启动说明")}</summary>
          <p>{tr("Run the downloaded .exe on the computer you want to connect. Follow its browser pairing page, check the computer and approve its permissions. PowerShell can also run the downloaded file.", "在你希望连接的电脑上运行下载的 .exe，按浏览器页面核对电脑并批准权限；也可以从 PowerShell 运行该文件。")}</p>
        </details>
        <details><summary><img src="/platform-brands/linux.svg" width="20" height="20" alt="" />{tr("Starting on Linux", "Linux 启动说明")}</summary>
          <p>{tr("Make the downloaded file executable with chmod +x, then run it in Terminal and follow the browser pairing page. The curl method below can also install the native Agent for you.", "使用 chmod +x 给下载的文件添加执行权限，再从终端运行并完成浏览器配对。也可以使用下方 curl 安装原生 Agent。")}</p>
        </details>
      </div>
    </section>

    <section className="nativeInstallOther">
      <h2>{tr("Other installation methods", "其他安装方式")}</h2>
      <details id="shell-install"><summary><span>curl</span><small>macOS · Linux · WSL</small></summary>
        <pre className="docsExample"><code>curl -fsSL https://remotearc.app/install.sh | sh</code></pre>
        <p>{tr("Installs the latest stable native Agent to ~/.local/bin and verifies SHA256, without Node.js or sudo. Then run the startup command printed by the installer to pair your computer. WSL installs inside WSL.", "无需 Node.js 或 sudo，获取最新稳定版原生 Agent，校验 SHA256 并安装到 ~/.local/bin。安装后运行终端提示的启动命令来配对电脑；在 WSL 中运行会安装到 WSL。")}</p>
        <p><a href="/install.sh">{tr("Read the installation script", "查看安装脚本")}</a></p>
      </details>
      <details><summary><span>npm / npx</span><small>{tr("Node.js 20+", "需要 Node.js 20+")}</small></summary>
        <pre className="docsExample"><code>npx remotelink@latest</code></pre>
        <p>{tr("Run on the Windows, macOS or Linux computer you want to connect, then follow the browser pairing steps.", "在希望连接的 Windows、macOS 或 Linux 电脑上运行，按浏览器提示完成配对。")}</p>
      </details>
      <details id="homebrew"><summary><span>Homebrew</span><small>macOS · Linux</small></summary>
        <pre className="docsExample"><code>{"brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc\nif brew command trust >/dev/null 2>&1; then brew trust --formula yaohuangguan/remote-arc/remotelink yaohuangguan/remote-arc/remotelink-go; fi\nbrew install yaohuangguan/remote-arc/remotelink\nremotelink"}</code></pre>
        <p>{tr("Node.js is not required. Existing remotelink-go installations can use brew upgrade remotelink-go. Install one formula at a time because both provide remotelink.", "不需要 Node.js。已安装 remotelink-go 时，可执行 brew upgrade remotelink-go。两个配方都提供 remotelink 命令，请只安装一个。")}</p>
      </details>
      <details><summary><span>{tr("Upgrade, stop and compatibility", "升级、停止与兼容选项")}</span></summary>
        <p>{tr("Stop the current Agent before upgrading. Ctrl+C stops a foreground session; remotelink --stop also stops background recovery. Pairing and Local Undo records are preserved. Native Go is the default; stop the active runtime before explicitly switching with --ts or --go. Runtime switches do not replay commands.", "升级前先停止当前 Agent。Ctrl+C 停止前台会话；remotelink --stop 同时停止后台恢复，配对和 Local Undo 记录会保留。默认运行原生 Go；使用 --ts 或 --go 切换前，先停止当前运行时。切换不会重放命令。")}</p>
        <pre className="docsExample"><code>{"npx remotelink@latest --stop\nnpx remotelink@latest --foreground"}</code></pre>
      </details>
    </section>
    <footer className="nativeInstallFooter"><a href="https://agent.remotearc.app/devices">{tr("Manage your computers", "管理已配对电脑")} →</a><a href={localizedWebsiteHref("/connect-ai", locale)}>{tr("Connect your AI", "连接你的 AI")} →</a></footer>
  </section>;
}
