import React, { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../lib/marketing-paths.js";
import "../styles/components/install-commands.css";

const methods = [
  { id: "npx", label: "npx", command: "npx remotelink@latest" },
  { id: "curl", label: "curl", command: "curl -fsSL https://remotearc.app/install.sh | sh" },
] as const;

export function InstallCommands({
  downloadHref,
  followHash = false,
}: { downloadHref?: string; followHash?: boolean } = {}) {
  const { tr, locale } = useI18n();
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [copyResult, setCopyResult] = useState<{ command: string; ok: boolean } | null>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const request = useRef(0);
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      request.current++;
      clearTimeout(reset.current);
    },
    [],
  );
  const method = methods[selected]!;
  const feedback = copyResult?.command === method.command ? copyResult : null;

  function select(index: number, focus = false) {
    request.current++;
    setCopyResult(null);
    clearTimeout(reset.current);
    setSelected(index);
    if (followHash) {
      const hash = index === 1 ? "#shell-install" : "#npx-install";
      if (window.location.hash !== hash)
        window.history.replaceState(window.history.state, "", hash);
    }
    if (focus) tabs.current[index]?.focus();
  }

  useEffect(() => {
    if (!followHash) return;
    const syncMethod = () => {
      if (window.location.hash === "#shell-install") select(1);
      else if (window.location.hash === "#npx-install") select(0);
    };
    syncMethod();
    window.addEventListener("hashchange", syncMethod);
    return () => window.removeEventListener("hashchange", syncMethod);
  }, [followHash]);

  function navigate(event: React.KeyboardEvent<HTMLButtonElement>) {
    const next =
      event.key === "ArrowRight"
        ? (selected + 1) % methods.length
        : event.key === "ArrowLeft"
          ? (selected + methods.length - 1) % methods.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? methods.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  async function copy() {
    const attempt = ++request.current;
    let ok = false;
    try {
      await navigator.clipboard.writeText(method.command);
      ok = true;
    } catch {
      /* Show the manual-copy instruction below. */
    }
    if (attempt !== request.current) return;
    setCopyResult({ command: method.command, ok });
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopyResult(null), 3000);
  }

  const requirements =
    method.id === "npx"
      ? tr("components.installCommands.nodeJsWindowsMacosLinux")
      : tr("components.installCommands.noNodeJsMacosLinuxWsl");

  return (
    <section
      className="installCommands"
      aria-label={tr("components.installCommands.installRemoteArc")}
    >
      <div className="installCommandsHeader">
        <span className="installCommandsLabel">
          {tr("components.installCommands.installOnYourComputer")}
        </span>
        <div className="installCommandsMethods">
          <div
            className="installCommandsTabs"
            role="tablist"
            aria-label={tr("components.installCommands.installationMethod")}
          >
            {methods.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                id={id + "-" + item.id}
                aria-controls={id + "-panel"}
                aria-selected={selected === index}
                tabIndex={selected === index ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={navigate}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a
            className="installCommandsDownload"
            href={downloadHref ?? localizedWebsiteHref("/downloads", locale)}
          >
            {tr("components.installCommands.download")}
          </a>
        </div>
      </div>
      <div className="installCommandsCard">
        <div
          className="installCommandsPanel"
          role="tabpanel"
          id={id + "-panel"}
          aria-labelledby={id + "-" + method.id}
          tabIndex={0}
        >
          <div className="installCommandsCode">
            <span className="installCommandsPrompt" aria-hidden="true">
              $
            </span>
            <pre>
              <code>{method.command}</code>
            </pre>
            <button
              className="installCommandsCopy"
              type="button"
              onClick={() => void copy()}
              aria-label={tr("components.installCommands.copyCommands", { label: method.label })}
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="7" y="7" width="9" height="10" rx="2" />
                <path d="M12 4V3H3v10h1" />
              </svg>
              <span>
                {feedback?.ok
                  ? tr("components.installCommands.copied")
                  : tr("components.installCommands.copy")}
              </span>
            </button>
          </div>
        </div>
      </div>
      <p className="installCommandsRequirements" role="status" aria-live="polite">
        {feedback
          ? feedback.ok
            ? tr("components.installCommands.commandsCopied")
            : tr("components.installCommands.clipboardBlockedSelectAndCopyThe")
          : requirements}
      </p>
      {method.id === "curl" && (
        <p className="installCommandsNext">
          {tr("components.installCommands.firstInstallStartsTheAgent")}
        </p>
      )}
    </section>
  );
}
