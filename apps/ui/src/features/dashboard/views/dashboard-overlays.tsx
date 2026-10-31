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

