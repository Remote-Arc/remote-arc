import React, { useEffect } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./public-docs.css";

// Vite derives this from dated stable CHANGELOG entries, even on RC branches.
declare const __REMOTEARC_CLI_VERSION__: string;
const version = __REMOTEARC_CLI_VERSION__;
const release = `https://github.com/Remote-Arc/remote-arc/releases/tag/remotelink-v${version}`;
const download = `https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/`;
const targets = [
  { os: "macOS", cpu: "Apple Silicon", platform: "darwin", arch: "arm64" },
  { os: "macOS", cpu: "Intel", platform: "darwin", arch: "amd64" },
  { os: "Windows", cpu: "x64", platform: "windows", arch: "amd64" },
  { os: "Windows", cpu: "ARM64", platform: "windows", arch: "arm64" },
  { os: "Linux", cpu: "x64", platform: "linux", arch: "amd64" },
  { os: "Linux", cpu: "ARM64", platform: "linux", arch: "arm64" },
] as const;

export function NativeInstall() {
  const { tr, locale } = useI18n();
  useEffect(() => {
    let frame: number | undefined;
    const alignFragment = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      // Lazy loading can miss native scrolling; always read the latest fragment.
      frame = requestAnimationFrame(() => {
        const hash = window.location.hash;
        if (hash === "#homebrew" || hash === "#shell-install") {
          document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
        }
      });
    };
    alignFragment();
    window.addEventListener("hashchange", alignFragment);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", alignFragment);
    };
  }, []);
  return <section id="agent-downloads" className="nativeInstall">
    <span className="eyebrow">REMOTE ARC {version}</span>
    <h1>{tr("Install the device Agent", "安装设备 Agent")}</h1>
    <p>{tr("Connect a Windows, macOS or Linux computer to your AI. Choose an installation method, run remotelink, then sign in to pair the computer and choose its permissions.", "将 Windows、macOS 或 Linux 电脑连接到 AI。选择安装方式并运行 remotelink，再登录配对电脑、选择设备权限。")}</p>

    <h2>npm / npx</h2>
    <pre className="docsExample"><code>npx remotelink@latest</code></pre>
    <p>{tr("Requires Node.js 20 or later. Run this command on the computer you want to connect, then follow the browser pairing steps. If Node.js is not installed, use one of the options below.", "需要 Node.js 20 或更高版本。在希望连接的电脑上运行此命令，按浏览器提示完成配对。没有安装 Node.js 时，使用下面的安装方式即可。")}</p>
    <div id="shell-install" className="nativeInstallQuickStart">
      <h2>{tr("Without Node.js · macOS / Linux", "无需 Node.js · macOS / Linux")}</h2>
      <pre className="docsExample"><code>{"curl -fsSL https://remotearc.app/install.sh | sh\nremotelink"}</code></pre>
      <p>{tr("Downloads the native Agent for x64 or ARM64, verifies SHA256 and installs to ~/.local/bin without sudo. WSL is supported. Pair your computer when you first run remotelink. If ~/.local/bin is outside PATH, use the full path printed by the installer.", "下载 x64 或 ARM64 原生 Agent，校验 SHA256，无需 sudo，安装到 ~/.local/bin，也支持 WSL。首次运行 remotelink 时配对电脑；若 ~/.local/bin 不在 PATH 中，使用安装脚本显示的完整路径。")}</p>
      <p>{tr("Set REMOTEARC_INSTALL_DIR to an absolute path to choose another directory. Stop the Agent before rerunning this command to upgrade.", "可通过 REMOTEARC_INSTALL_DIR 指定其他绝对安装路径。升级时先停止 Agent，再重新运行此命令。")}</p>
      <a href="/install.sh">{tr("Read the installation script", "查看安装脚本")} →</a>
    </div>
    <h2 id="homebrew">Homebrew</h2>
    <pre className="docsExample"><code>{"brew tap yaohuangguan/remote-arc https://github.com/yaohuangguan/remote-arc\nif brew command trust >/dev/null 2>&1; then brew trust --formula yaohuangguan/remote-arc/remotelink yaohuangguan/remote-arc/remotelink-go; fi\nbrew install yaohuangguan/remote-arc/remotelink\nremotelink"}</code></pre>
    <p>{tr("Available on macOS and Linux; Node.js is not required. Existing remotelink-go installations can use brew upgrade remotelink-go. Install one formula at a time because both provide the remotelink command.", "适用于 macOS 和 Linux，不需要 Node.js。已安装 remotelink-go 的用户可以执行 brew upgrade remotelink-go；两个配方都提供 remotelink 命令，请只安装其中一个。")}</p>
    <h2>{tr("Standalone downloads", "直接下载")}</h2>
    <p>{tr("No Node.js or Go toolchain is needed. Choose your operating system and processor.", "不需要 Node.js 或 Go 编译环境，请按操作系统和处理器选择。")}</p>
    <ul className="nativeDownloads">{targets.map(target => {
      const asset = `remotelink-v${version}-${target.platform}-${target.arch}${target.platform === "windows" ? ".exe" : ""}`;
      return <li key={asset}><a href={download + asset}>{target.os} · {target.cpu}</a></li>;
    })}</ul>
    <p><a href={download + "SHA256SUMS"}>SHA256SUMS</a>{" · "}<a href={release}>{tr("Release notes and all files", "发布说明与全部文件")}</a></p>
    <p>{tr("On Windows, run the downloaded .exe from your terminal. On macOS/Linux, make the downloaded file executable with chmod +x, then run it from Terminal. For example, on an Apple Silicon Mac:", "Windows 从终端运行下载的 .exe；macOS/Linux 先用 chmod +x 添加执行权限，再从终端运行。例如 Apple Silicon Mac：")}</p>
    <pre className="docsExample"><code>{`chmod +x ./remotelink-v${version}-darwin-arm64\n./remotelink-v${version}-darwin-arm64 --foreground`}</code></pre>
    <h2>{tr("Upgrade or stop the Agent", "升级或停止 Agent")}</h2>
    <p>{tr("Stop the current Agent before upgrading through your chosen installation method. Ctrl+C stops a foreground session. remotelink --stop also stops background recovery. Your computer pairing and Local Undo records are preserved.", "先停止当前 Agent，再使用原来的安装方式升级。Ctrl+C 停止前台运行；remotelink --stop 同时停止后台恢复。电脑配对和 Local Undo 记录会保留。")}</p>
    <pre className="docsExample"><code>{"npx remotelink@latest --stop\nnpx remotelink@latest --foreground"}</code></pre>
    <details><summary>{tr("Advanced: compatibility runtime", "高级：兼容运行时")}</summary><p>{tr("The native Go Agent is the default; --go remains a compatible alias. To leave an older TS Agent, run npx remotelink@latest --ts --no-background and stop its original terminal before starting Go. To return to TS, stop Go first, then use npx remotelink@latest --ts. Runtime switches do not replay commands.", "默认使用原生 Go Agent，--go 保留为兼容别名。从旧 TS Agent 迁移时，先运行 npx remotelink@latest --ts --no-background，再停止原终端并启动 Go。回退到 TS 时先停止 Go，再运行 npx remotelink@latest --ts。切换运行时不会重放命令。")}</p></details>
    <p><a href="https://agent.remotearc.app/devices">{tr("Manage your devices", "管理你的设备")} →</a>{" · "}<a href={localizedWebsiteHref("/docs/connect",locale)}>{tr("Connect your AI", "连接你的 AI")} →</a></p>
  </section>;
}
