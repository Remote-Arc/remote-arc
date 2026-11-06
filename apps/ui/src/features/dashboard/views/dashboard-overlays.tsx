import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

// Modal dialogs rendered above every tab.
export function DirectoryPickerDialog({ m }: { m: DashboardModel }) {
  const { addCurrentWorkspace, browseDeviceDirectories, directoryPicker, setDirectoryPicker, tr } =
    m;
  if (!directoryPicker) return null;
  return (
    <div className="modalBackdrop" onMouseDown={() => setDirectoryPicker(null)}>
      <section
        className="modal directoryPickerModal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modalClose" onClick={() => setDirectoryPicker(null)}>
          ×
        </button>
        <span className="eyebrow">{tr("dashboard.views.dashboardOverlays.chooseWorkspace")}</span>
        <h2>
          {tr("dashboard.views.dashboardOverlays.chooseAFolderOn", {
            name: directoryPicker.device.name,
          })}
        </h2>
        <p>{tr("dashboard.views.dashboardOverlays.remoteArcWillAddTheSelected")}</p>

        {directoryPicker.browser && (
          <div className="directoryPickerPath">
            <code>{directoryPicker.browser.path}</code>
            {directoryPicker.browser.parent && (
              <button
                className="ghostButton small"
                onClick={() =>
                  void browseDeviceDirectories(
                    directoryPicker.device,
                    directoryPicker.browser!.parent!,
                  )
                }
              >
                ↑ {tr("dashboard.views.dashboardOverlays.parent")}
              </button>
            )}
          </div>
        )}

        <div className="directoryPickerList">
          {directoryPicker.loading && (
            <div className="directoryPickerEmpty">
              {tr("dashboard.views.dashboardOverlays.loadingFolders")}
            </div>
          )}
          {!directoryPicker.loading && !!directoryPicker.error && (
            <div className="policyWarning">{directoryPicker.error}</div>
          )}
          {!directoryPicker.loading &&
            !directoryPicker.error &&
            directoryPicker.browser?.directories.map((entry) => (
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
          {!directoryPicker.loading &&
            !directoryPicker.error &&
            directoryPicker.browser &&
            !directoryPicker.browser.directories.length && (
              <div className="directoryPickerEmpty">
                {tr("dashboard.views.dashboardOverlays.noVisibleChildFolders")}
              </div>
            )}
        </div>

        {directoryPicker.browser && directoryPicker.browser.protected_entries_omitted > 0 && (
          <p className="directoryPickerNote">
            {tr("dashboard.views.dashboardOverlays.protectedFolderSAreHiddenBy", {
              protected_entries_omitted: directoryPicker.browser.protected_entries_omitted,
            })}
          </p>
        )}

        <div className="dialogActions">
          <button className="ghostButton" onClick={() => setDirectoryPicker(null)}>
            {tr("dashboard.views.dashboardOverlays.cancel")}
          </button>
          <button
            className="primaryButton"
            disabled={!directoryPicker.browser || directoryPicker.loading}
            onClick={() => void addCurrentWorkspace()}
          >
            {tr("dashboard.views.dashboardOverlays.useThisFolder")}
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
    <div
      className="modalBackdrop"
      onMouseDown={() => settleDialog(dialog.kind === "notice" ? true : null)}
    >
      <section
        ref={dialogElement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-dialog-title"
        className={"modal appDialog " + (dialog.tone === "danger" ? "danger" : "")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="modalClose"
          aria-label={tr("dashboard.views.dashboardOverlays.close")}
          onClick={() => settleDialog(dialog.kind === "notice" ? true : null)}
        >
          ×
        </button>
        <span className="eyebrow">
          {dialog.kind === "prompt"
            ? tr("dashboard.views.dashboardOverlays.inputRequired")
            : dialog.tone === "danger"
              ? tr("dashboard.views.dashboardOverlays.confirmAction")
              : tr("dashboard.views.dashboardOverlays.remoteArc")}
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
              {dialog.cancelLabel || tr("dashboard.views.dashboardOverlays.cancel")}
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
