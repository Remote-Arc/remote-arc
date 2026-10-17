import React, { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./install-commands.css";

const methods = [
  { id: "npx", label: "npx", command: "npx remotelink" },
  { id: "curl", label: "curl", command: "curl -fsSL https://remotearc.app/install.sh | sh\nremotelink" },
  { id: "brew", label: "Homebrew", command: "brew install yaohuangguan/remote-arc/remotelink\nremotelink" },
] as const;

export function InstallCommands() {
  const { locale, tr } = useI18n();
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [copyResult, setCopyResult] = useState<{ command: string; ok: boolean } | null>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const request = useRef(0);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { request.current++; clearTimeout(reset.current); }, []);
  const method = methods[selected]!;
  const feedback = copyResult?.command === method.command ? copyResult : null;

  function select(index: number, focus = false) {
    request.current++;
    setCopyResult(null);
    clearTimeout(reset.current);
    setSelected(index);
    if (focus) tabs.current[index]?.focus();
  }

  function navigate(event: React.KeyboardEvent<HTMLButtonElement>) {
    const next = event.key === "ArrowRight" ? (selected + 1) % methods.length
      : event.key === "ArrowLeft" ? (selected + methods.length - 1) % methods.length
      : event.key === "Home" ? 0 : event.key === "End" ? methods.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  async function copy() {
    const attempt = ++request.current;
    let ok = false;
    try { await navigator.clipboard.writeText(method.command); ok = true; } catch { /* Show the manual-copy instruction below. */ }
    if (attempt !== request.current) return;
    setCopyResult({ command: method.command, ok });
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopyResult(null), 3000);
  }

  const requirements = method.id === "npx"
    ? tr("Windows, macOS & Linux · Node.js 20+", "Windows、macOS、Linux · 需要 Node.js 20+")
    : method.id === "curl"
      ? tr("macOS & Linux / WSL · No Node.js · SHA256 verified", "macOS、Linux / WSL · 无需 Node.js · SHA256 校验")
      : tr("macOS & Linux · Homebrew required · No Node.js", "macOS、Linux · 需要 Homebrew · 无需 Node.js");

  return <section className="installCommands" aria-label={tr("Install Remote Arc", "安装 Remote Arc")}>
    <div className="installCommandsHeader">
      <span className="installCommandsLabel">{tr("GET STARTED", "开始使用")}</span>
      <span className="installCommandsHint">{tr("Run on your computer", "在你的电脑上运行")}</span>
    </div>
    <div className="installCommandsCard">
      <div className="installCommandsTabs" role="tablist" aria-label={tr("Installation method", "安装方式")}>
        {methods.map((item, index) => <button key={item.id} type="button" role="tab"
          ref={node => { tabs.current[index] = node; }}
          id={id + "-" + item.id} aria-controls={id + "-panel"}
          aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
          onClick={() => select(index)} onKeyDown={navigate}>
          {item.label}{index === 0 && <span className="installCommandsRecommended">{tr("Recommended", "推荐")}</span>}
        </button>)}
      </div>
      <div className="installCommandsPanel" role="tabpanel" id={id + "-panel"}
        aria-labelledby={id + "-" + method.id} tabIndex={0}>
        <div className="installCommandsCode">
          <span className="installCommandsPrompt" aria-hidden="true">$</span>
          <pre><code>{method.command}</code></pre>
          <button className="installCommandsCopy" type="button" onClick={() => void copy()}
            aria-label={tr("Copy " + method.label + " commands", "复制 " + method.label + " 命令")}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M12 4V3H3v10h1" /></svg>
            <span>{feedback?.ok ? tr("Copied", "已复制") : tr("Copy", "复制")}</span>
          </button>
        </div>
        <p className="installCommandsRequirements">{requirements}</p>
      </div>
      <div className="installCommandsFooter">
        <span className="installCommandsFeedback" role="status" aria-live="polite">
          {feedback ? feedback.ok ? tr("Commands copied.", "命令已复制。") : tr("Clipboard blocked. Select and copy the command.", "剪贴板不可用，请选中命令手动复制。")
            : method.id === "brew"
              ? <a href={localizedWebsiteHref("/downloads", locale) + "#homebrew"}>{tr("First install? Tap & trust guide", "首次安装？查看 Tap 与 Trust 步骤")} ↗</a>
              : tr("Native Go Agent", "原生 Go Agent")}
        </span>
        <a href={localizedWebsiteHref("/downloads", locale)}>{tr("Native downloads", "直接下载")} ↗</a>
      </div>
    </div>
  </section>;
}
