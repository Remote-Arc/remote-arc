import { CopyButton } from "../../../components/public-layout.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";

// Modal dialogs rendered above every tab.
export function DirectoryPickerDialog({ m }: { m: DashboardModel }) {
  const {
    addCurrentWorkspace, browseDeviceDirectories, directoryPicker, setDirectoryPicker, tr,
  } = m;
  if (!directoryPicker) return null;
  return (
    <div className="modalBackdrop" onMouseDown={() => setDirectoryPicker(null)}>
      <section className="modal directoryPickerModal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modalClose" onClick={() => setDirectoryPicker(null)}>×</button>
        <span className="eyebrow">{tr("CHOOSE WORKSPACE", "选择工作区")}</span>
        <h2>{tr("Choose a folder on " + directoryPicker.device.name, "选择 " + directoryPicker.device.name + " 上的目录")}</h2>
        <p>{tr(
          "Remote Arc will add the selected folder to Trusted Write Locations. Sensitive paths remain protected.",
          "Remote Arc 会把所选目录加入可信写入区域；敏感路径保护仍然生效。",
        )}</p>

        {directoryPicker.browser && (
          <div className="directoryPickerPath">
            <code>{directoryPicker.browser.path}</code>
            {directoryPicker.browser.parent && (
              <button className="ghostButton small" onClick={() => void browseDeviceDirectories(directoryPicker.device, directoryPicker.browser!.parent!)}>
                ↑ {tr("Parent", "上一级")}
              </button>
            )}
          </div>
        )}

        <div className="directoryPickerList">
          {directoryPicker.loading && <div className="directoryPickerEmpty">{tr("Loading folders…", "正在加载目录…")}</div>}
          {!directoryPicker.loading && !!directoryPicker.error && (
            <div className="policyWarning">{directoryPicker.error}</div>
          )}
          {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser?.directories.map((entry) => (
            <button
              className="directoryPickerEntry"
              key={entry.path}
              onClick={() => void browseDeviceDirectories(directoryPicker.device, entry.path)}
            >
              <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
              <strong>{entry.name}</strong>
              <small>›</small>
            </button>
          ))}
          {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser && !directoryPicker.browser.directories.length && (
            <div className="directoryPickerEmpty">{tr("No visible child folders.", "没有可见的子目录。")}</div>
          )}
        </div>

        {directoryPicker.browser && directoryPicker.browser.protected_entries_omitted > 0 && (
          <p className="directoryPickerNote">{tr(
            directoryPicker.browser.protected_entries_omitted + " protected folder(s) are hidden by Sensitive Path Policy.",
            "有 " + directoryPicker.browser.protected_entries_omitted + " 个受保护目录已被 Sensitive Path Policy 隐藏。",
          )}</p>
        )}

        <div className="dialogActions">
          <button className="ghostButton" onClick={() => setDirectoryPicker(null)}>{tr("Cancel", "取消")}</button>
          <button className="primaryButton" disabled={!directoryPicker.browser || directoryPicker.loading} onClick={() => void addCurrentWorkspace()}>
            {tr("Use this folder", "使用当前目录")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function DashboardDialogHost({ m }: { m: DashboardModel }) {
  const { dialog, dialogElement, dialogValue, setDialogValue, settleDialog, tr } = m;
  if (!dialog) return null;
  return (
    <div className="modalBackdrop" onMouseDown={() => settleDialog(dialog.kind === "notice" ? true : null)}>
      <section ref={dialogElement} role="dialog" aria-modal="true" aria-labelledby="dashboard-dialog-title" className={"modal appDialog " + (dialog.tone === "danger" ? "danger" : "")} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modalClose" aria-label={tr("Close", "关闭")} onClick={() => settleDialog(dialog.kind === "notice" ? true : null)}>×</button>
        <span className="eyebrow">
          {dialog.kind === "prompt"
            ? tr("INPUT REQUIRED", "需要输入")
            : dialog.tone === "danger"
              ? tr("CONFIRM ACTION", "确认操作")
              : tr("REMOTE ARC", "REMOTE ARC")}
        </span>
        <h2 id="dashboard-dialog-title">{dialog.title}</h2>
        <p>{dialog.message}</p>
        {dialog.kind === "prompt" && (
          <input
            className="dialogInput"
            autoFocus
            value={dialogValue}
            placeholder={dialog.placeholder}
            onChange={(event) => setDialogValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && dialogValue.trim()) settleDialog(dialogValue.trim());
              if (event.key === "Escape") settleDialog(null);
            }}
          />
        )}
        <div className="dialogActions">
          {dialog.kind !== "notice" && (
            <button className="ghostButton" onClick={() => settleDialog(null)}>
              {dialog.cancelLabel || tr("Cancel", "取消")}
            </button>
          )}
          <button
            className={dialog.tone === "danger" ? "dangerButton" : "primaryButton"}
            disabled={dialog.kind === "prompt" && !dialogValue.trim()}
            onClick={() => settleDialog(dialog.kind === "prompt" ? dialogValue.trim() : true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AddDeviceDialog({ m }: { m: DashboardModel }) {
  const { command, safeCommand, setShowAdd, tr } = m;
  return (
    <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
        <span className="eyebrow">{tr("ADD A DEVICE", "添加设备")}</span>
        <h2>{tr("Connect a computer in one command.", "一条命令连接电脑。")}</h2>
        <p>{tr("No repository clone, environment file, token copy, public IP or router configuration. New devices start with read-only skills enabled.", "无需 clone 仓库、环境文件、复制 Token、公网 IP 或路由器配置。新设备默认只开启只读技能。")}</p>
        <div className="commandLabel">{tr("Recommended · Safe by default", "推荐 · 默认 Safe")}</div>
        <div className="commandBox"><code>{command}</code><CopyButton value={command}/></div>
        <p><a href="/downloads" target="_blank" rel="noopener noreferrer">{tr("Install without Node.js: native download or Homebrew", "无需 Node.js：直接下载或使用 Homebrew")} →</a></p>
        <div className="commandLabel secondary">{tr("Optional local hard lock · always read-only", "可选本机硬限制 · 始终只读")}</div>
        <div className="commandBox muted"><code>{safeCommand}</code><CopyButton value={safeCommand}/></div>
        <div className="onboardingSteps">
          <div><b>1</b><span><strong>{tr("Run the command", "运行命令")}</strong><small>npm / npx · Node.js 20+</small></span></div>
          <div><b>2</b><span><strong>{tr("Match the pairing code", "确认配对码")}</strong><small>{tr("The browser opens automatically", "浏览器会自动打开")}</small></span></div>
          <div><b>3</b><span><strong>{tr("Authorize the computer", "授权电脑")}</strong><small>{tr("It appears here after connecting", "连接后会自动出现在这里")}</small></span></div>
        </div>
      </section>
    </div>
  );
}
