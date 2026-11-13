import { useState } from "react";
import { RunnerAttentionSetting } from "../../browser-runner/runner-view.js";
import { deviceToolText } from "./device-tool-text.js";
import { PowerCommandsSetting } from "./power-commands-setting.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { UI_PREVIEW } from "../../../preview/preview-mode.js";
import { HelpTip } from "../../../components/public-layout.js";
import { timeAgo } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: MCP access, browser tools, file boundaries and Local Undo.
export function DeviceAccessPanel({
  m,
  device,
  facts,
}: {
  m: DashboardModel;
  device: Device;
  facts: DeviceFacts;
}) {
  const [runnerSettingsOpen, setRunnerSettingsOpen] = useState(false);
  const {
    addPolicyPath,
    applyDevicePreset,
    browseDeviceDirectories,
    devicePanel,
    loadUndoHistory,
    removePolicyPath,
    restoreUndoAction,
    saveDevicePolicy,
    sensitivePolicyBusyId,
    tr,
    undoByDevice,
    undoErrors,
    undoLoading,
    updateDeviceTools,
    updateSensitiveProtection,
  } = m;
  const {
    accessPreset,
    advertisedTools,
    allTools,
    enabledTools,
    runnerAdvertised,
    runnerEnabled,
    runnerVisible,
  } = facts;
  const runnerText = deviceToolText("browser_runner", tr);
  return (
    <section
      role="tabpanel"
      id={"device-panel-" + device.id + "-access"}
      aria-labelledby={"device-tab-" + device.id + "-access"}
      aria-label={tr("dashboard.devices.deviceAccessPanel.accessAndFiles")}
      hidden={devicePanel !== "access"}
    >
      <div className="deviceAccessSummary">
        <div>
          <span className="eyebrow">{tr("dashboard.devices.deviceAccessPanel.mcpAccess")}</span>
          <strong>
            {accessPreset === "safe"
              ? tr("dashboard.devices.deviceAccessPanel.safeReadOnly")
              : accessPreset === "developer"
                ? tr("dashboard.devices.deviceAccessPanel.developerFilesCanBeEdited")
                : accessPreset === "full"
                  ? tr("dashboard.devices.deviceAccessPanel.fullAccessTerminalEnabled")
                  : tr("dashboard.devices.deviceAccessPanel.customToolPolicy")}
          </strong>
          <p>{tr("dashboard.devices.deviceAccessPanel.newDevicesStartInSafeEnable")}</p>
        </div>
      </div>

      <div className="devicePresetRow">
        <span>{tr("dashboard.devices.deviceAccessPanel.quickPresets")}</span>
        <div>
          <button
            className={accessPreset === "safe" ? "active" : ""}
            onClick={() => void applyDevicePreset(device, "safe")}
          >
            <strong>Safe</strong>
            <small>{tr("dashboard.devices.deviceAccessPanel.readOnly")}</small>
          </button>
          <button
            className={accessPreset === "developer" ? "active" : ""}
            onClick={() => void applyDevicePreset(device, "developer")}
          >
            <strong>Developer</strong>
            <small>{tr("dashboard.devices.deviceAccessPanel.readEdit")}</small>
          </button>
          <button
            className={accessPreset === "full" ? "active danger" : "danger"}
            onClick={() => void applyDevicePreset(device, "full")}
          >
            <strong>Full</strong>
            <small>{tr("dashboard.devices.deviceAccessPanel.terminal")}</small>
          </button>
        </div>
      </div>

      <details className="deviceToolDetails">
        <summary>
          <span className="deviceDisclosureTitle">
            <ProductIcon name="settings" size={16} />
            {tr("dashboard.devices.deviceAccessPanel.manageIndividualSkills")}
          </span>
          <span>
            {allTools.filter((tool) => enabledTools.includes(tool)).length +
              (runnerVisible && runnerEnabled ? 1 : 0)}{" "}
            / {allTools.length + (runnerVisible ? 1 : 0)}
            <ProductIcon name="chevron" size={14} />
          </span>
        </summary>
        <div className="toolToggleGrid">
          {runnerVisible && (
            <div
              className={"toolToggle browserRunnerTool" + (!runnerAdvertised ? " unavailable" : "")}
              key="browser_runner"
            >
              <label className="browserRunnerToggle">
                <input
                  type="checkbox"
                  checked={runnerEnabled}
                  disabled={!runnerAdvertised && !runnerEnabled}
                  onChange={(event) => {
                    if (!event.target.checked) setRunnerSettingsOpen(false);
                    void updateDeviceTools(device, "browser_runner_act", event.target.checked);
                  }}
                />
                <strong>{runnerText.label}</strong>
              </label>
              <HelpTip
                label={tr("dashboard.devices.deviceAccessPanel.about", { tool: runnerText.label })}
                text={
                  runnerAdvertised
                    ? runnerText.help
                    : tr("dashboard.devices.deviceAccessPanel.needsRemoteArcAgentRcOr")
                }
              />
              {runnerEnabled && (
                <button
                  type="button"
                  className="browserRunnerSettingsButton"
                  aria-label={tr("dashboard.devices.deviceAccessPanel.browserRunnerSettings")}
                  title={tr("dashboard.devices.deviceAccessPanel.browserRunnerSettings")}
                  aria-expanded={runnerSettingsOpen}
                  aria-controls={"runner-settings-" + device.id}
                  onClick={() => setRunnerSettingsOpen((open) => !open)}
                >
                  <ProductIcon name="settings" size={14} />
                </button>
              )}
            </div>
          )}
          {runnerEnabled && runnerSettingsOpen && (
            <div
              className="browserRunnerSettingsPanel"
              id={"runner-settings-" + device.id}
              role="region"
              aria-label={tr("dashboard.devices.deviceAccessPanel.browserRunnerSettings")}
            >
              <RunnerAttentionSetting deviceId={device.id} />
              <p className="browserAuthenticationNotice">
                {tr("dashboard.devices.deviceAccessPanel.completeSignInVerificationCodesAnd")}
              </p>
            </div>
          )}
          {device.platform === "browser" && (
            <p className="runnerSetting browserAuthenticationNotice">
              {tr("dashboard.devices.deviceAccessPanel.completeSignInVerificationCodesAnd2")}
            </p>
          )}
          {allTools.map((tool) => {
            const enabled =
              device.allowed_tools == null
                ? device.status === "online"
                  ? advertisedTools.includes(tool)
                  : true
                : device.allowed_tools.includes(tool);
            const advertised = device.status === "online" ? advertisedTools.includes(tool) : true;
            const { label, help } = deviceToolText(tool, tr);
            return (
              <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!advertised}
                  onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)}
                />
                <span className="skillLabel">
                  <strong>{label}</strong>
                  <HelpTip
                    label={tr("dashboard.devices.deviceAccessPanel.about", { tool: label })}
                    text={help}
                  />
                </span>
              </label>
            );
          })}
        </div>
        {device.status === "offline" && (
          <span className="offlineTools">
            {tr("dashboard.devices.deviceAccessPanel.offlineChangesAreSavedNowAnd")}
          </span>
        )}
      </details>

      <details className="deviceSafetyDetails">
        <summary>
          <span className="deviceDisclosureTitle">
            <ProductIcon name="shield" size={16} />
            {tr("dashboard.devices.deviceAccessPanel.fileBoundariesRecovery")}
          </span>
          <span>
            {(device.protect_sensitive_paths ?? true)
              ? tr("dashboard.devices.deviceAccessPanel.sensitivePathsProtected")
              : tr("dashboard.devices.deviceAccessPanel.sensitiveProtectionOff")}
            {" · "}
            {(device.workspace_roots || []).length
              ? (device.workspace_roots || []).length +
                " " +
                tr("dashboard.devices.deviceAccessPanel.workspaces")
              : tr("dashboard.devices.deviceAccessPanel.readOnlyUntilScoped")}
            <ProductIcon name="chevron" size={14} />
          </span>
        </summary>

        <div className="deviceSafetyBody">
          {!device.policy_enforcement_available && device.status === "online" && (
            <p className="policyWarning">
              {tr("dashboard.devices.deviceAccessPanel.thisDeviceIsStillRunningAn")}
            </p>
          )}
          <div className="policyToggleRow">
            <div className="labelWithHelp">
              <strong>{tr("dashboard.devices.deviceAccessPanel.sensitivePathPolicy")}</strong>
              <HelpTip
                label={tr("dashboard.devices.deviceAccessPanel.aboutSensitivePathPolicy")}
                text={tr("dashboard.devices.deviceAccessPanel.enabledByDefaultProtectsBuiltIn")}
              />
            </div>
            <label
              className="compactSwitch"
              title={tr(
                "dashboard.devices.deviceAccessPanel.sensitivePathProtectionEnabledByDefault",
              )}
            >
              <input
                type="checkbox"
                checked={device.protect_sensitive_paths ?? true}
                disabled={UI_PREVIEW || sensitivePolicyBusyId === device.id}
                onChange={(event) => void updateSensitiveProtection(device, event.target.checked)}
              />
              <span />
            </label>
          </div>

          {device.protect_sensitive_paths === false && (
            <p className="policyWarning" role="alert">
              {tr("dashboard.devices.deviceAccessPanel.sensitivePathProtectionIsOffBuilt")}
            </p>
          )}
          <div className="policyBlock">
            <div className="policyBlockHead">
              <div className="labelWithHelp">
                <strong>{tr("dashboard.devices.deviceAccessPanel.trustedWriteLocations")}</strong>
                <HelpTip
                  label={tr("dashboard.devices.deviceAccessPanel.aboutTrustedWriteLocations")}
                  text={tr("dashboard.devices.deviceAccessPanel.theseAreTrustedMutationRootsRead")}
                />
              </div>
              <div className="policyHeaderActions">
                <button
                  className="ghostButton small"
                  disabled={device.status !== "online"}
                  onClick={() => void browseDeviceDirectories(device)}
                >
                  {tr("dashboard.devices.deviceAccessPanel.browseFolders")}
                </button>
                <button
                  className="ghostButton small"
                  onClick={() => void addPolicyPath(device, "workspace_roots")}
                >
                  + {tr("dashboard.devices.deviceAccessPanel.enterPath")}
                </button>
              </div>
            </div>
            <div className="policyPathList">
              {(device.workspace_roots || []).map((root) => (
                <span className="policyPathChip" key={root}>
                  <code>{root}</code>
                  <button
                    title={tr("dashboard.devices.deviceAccessPanel.remove")}
                    onClick={() => void removePolicyPath(device, "workspace_roots", root)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!(device.workspace_roots || []).length && (
                <span className="policyEmpty">
                  {tr("dashboard.devices.deviceAccessPanel.noTrustedWriteWorkspaceYetRead")}
                </span>
              )}
            </div>
            {enabledTools.includes("start_process") && !!(device.workspace_roots || []).length && (
              <p className="policyWarning">
                {tr("dashboard.devices.deviceAccessPanel.fullTerminalAccessIsNotAn")}
              </p>
            )}
          </div>

          <div className="policyBlock">
            <div className="policyBlockHead">
              <div className="labelWithHelp">
                <strong>{tr("dashboard.devices.deviceAccessPanel.extraProtectedPaths")}</strong>
                <HelpTip
                  label={tr("dashboard.devices.deviceAccessPanel.aboutExtraProtectedPaths")}
                  text={tr("dashboard.devices.deviceAccessPanel.addPrivateFoldersThatShouldRemain")}
                />
              </div>
              <button
                className="ghostButton small"
                onClick={() => void addPolicyPath(device, "sensitive_paths")}
              >
                + {tr("dashboard.devices.deviceAccessPanel.protectPath")}
              </button>
            </div>
            <div className="policyPathList">
              {(device.sensitive_paths || []).map((root) => (
                <span className="policyPathChip protected" key={root}>
                  <code>{root}</code>
                  <button
                    title={tr("dashboard.devices.deviceAccessPanel.remove")}
                    onClick={() => void removePolicyPath(device, "sensitive_paths", root)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!(device.sensitive_paths || []).length && (
                <span className="policyEmpty">
                  {tr("dashboard.devices.deviceAccessPanel.builtInSensitivePathsOnly")}
                </span>
              )}
            </div>
          </div>

          <div className="policyBlock">
            <div className="policyBlockHead">
              <div className="labelWithHelp">
                <strong>{tr("dashboard.devices.deviceAccessPanel.sensitivePathExceptions")}</strong>
                <HelpTip
                  label={tr("dashboard.devices.deviceAccessPanel.aboutSensitivePathExceptions")}
                  text={tr(
                    "dashboard.devices.deviceAccessPanel.keepProtectionEnabledGloballyButExplicitly",
                  )}
                />
              </div>
              <button
                className="ghostButton small"
                onClick={() => void addPolicyPath(device, "sensitive_allow_paths")}
              >
                + {tr("dashboard.devices.deviceAccessPanel.allowException")}
              </button>
            </div>
            <div className="policyPathList">
              {(device.sensitive_allow_paths || []).map((root) => (
                <span className="policyPathChip exception" key={root}>
                  <code>{root}</code>
                  <button
                    title={tr("dashboard.devices.deviceAccessPanel.remove")}
                    onClick={() => void removePolicyPath(device, "sensitive_allow_paths", root)}
                  >
                    ×
                  </button>
                </span>
              ))}
              {!(device.sensitive_allow_paths || []).length && (
                <span className="policyEmpty">
                  {tr("dashboard.devices.deviceAccessPanel.noSensitivePathExceptions")}
                </span>
              )}
            </div>
          </div>

          <PowerCommandsSetting m={m} device={device} />

          <div className="policyToggleRow undoPolicyToggle">
            <div className="labelWithHelp">
              <strong>{tr("dashboard.devices.deviceAccessPanel.createLocalUndoSnapshots")}</strong>
              <HelpTip
                label={tr("dashboard.devices.deviceAccessPanel.aboutLocalUndoSnapshots")}
                text={tr(
                  "dashboard.devices.deviceAccessPanel.recoverySettingWhenEnabledSupportedFile",
                )}
              />
            </div>
            <label className="compactSwitch">
              <input
                type="checkbox"
                checked={device.undo_enabled ?? true}
                onChange={(event) =>
                  void saveDevicePolicy(device, {
                    undo_enabled: event.target.checked,
                  })
                }
              />
              <span />
            </label>
          </div>

          <div className="undoHistorySection">
            <div className="policyBlockHead">
              <div className="labelWithHelp">
                <strong>{tr("dashboard.devices.deviceAccessPanel.undoHistory")}</strong>
                <HelpTip
                  label={tr("dashboard.devices.deviceAccessPanel.aboutUndoHistory")}
                  text={tr("dashboard.devices.deviceAccessPanel.loadedDirectlyFromTheDeviceOn")}
                />
              </div>
              <button
                className="ghostButton small"
                disabled={
                  device.status !== "online" ||
                  !device.undo_history_available ||
                  undoLoading === device.id
                }
                onClick={() => void loadUndoHistory(device)}
              >
                {undoLoading === device.id
                  ? tr("dashboard.devices.deviceAccessPanel.loading")
                  : tr("dashboard.devices.deviceAccessPanel.refresh")}
              </button>
            </div>

            {!device.undo_history_available && (
              <p className="policyNotice">
                {tr("dashboard.devices.deviceAccessPanel.undoHistoryUiRequiresTheLatest")}
              </p>
            )}

            {!!undoErrors[device.id] && <p className="policyWarning">{undoErrors[device.id]}</p>}

            {!!undoByDevice[device.id]?.length && (
              <div className="undoActionList">
                {(undoByDevice[device.id] || []).map((action) => (
                  <div className="undoActionRow" key={action.id}>
                    <div>
                      <strong>{action.tool}</strong>
                      <code title={action.path}>{action.path}</code>
                      <small>
                        {timeAgo(action.created_at)}
                        {" · "}
                        {action.existed_before
                          ? tr("dashboard.devices.deviceAccessPanel.restorePreviousContent")
                          : tr("dashboard.devices.deviceAccessPanel.removeCreatedFile")}
                        {" · "}
                        {action.status === "ready"
                          ? tr("dashboard.devices.deviceAccessPanel.ready")
                          : action.status === "conflict"
                            ? tr("dashboard.devices.deviceAccessPanel.conflictFileChangedAgain")
                            : action.status === "missing"
                              ? tr("dashboard.devices.deviceAccessPanel.targetMissing")
                              : tr("dashboard.devices.deviceAccessPanel.legacySnapshot")}
                      </small>
                    </div>
                    <button
                      className="ghostButton small"
                      disabled={
                        undoLoading === device.id ||
                        !(device.undo_enabled ?? true) ||
                        !action.can_undo
                      }
                      title={
                        action.can_undo
                          ? tr("dashboard.devices.deviceAccessPanel.restoreThisLocalSnapshot")
                          : tr(
                              "dashboard.devices.deviceAccessPanel.automaticUndoIsUnavailableBecauseThe",
                            )
                      }
                      onClick={() => void restoreUndoAction(device, action)}
                    >
                      {action.can_undo
                        ? tr("dashboard.devices.deviceAccessPanel.undo")
                        : tr("dashboard.devices.deviceAccessPanel.unavailable")}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {undoByDevice[device.id] !== undefined &&
              !(undoByDevice[device.id] || []).length &&
              !undoErrors[device.id] && (
                <p className="policyEmpty">
                  {tr("dashboard.devices.deviceAccessPanel.noReversibleRemoteArcFileChanges")}
                </p>
              )}
          </div>
        </div>
      </details>
    </section>
  );
}
