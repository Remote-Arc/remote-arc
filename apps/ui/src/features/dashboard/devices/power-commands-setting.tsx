import { HelpTip } from "../../../components/public-layout.js";
import { ProductIcon } from "../../../components/product-icon.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import type { Device } from "../../../types/app-types.js";
import "../../../styles/dashboard/devices/power-commands.css";

// "Allow shutdown and restart" in File boundaries & recovery. Off by default; the
// switch works only where the Agent can honour it.
export function PowerCommandsSetting({ m, device }: { m: DashboardModel; device: Device }) {
  const { tr, powerCommandsAllowed, powerCommandsBusyId, setPowerCommands } = m;
  const allowed = powerCommandsAllowed(device);
  const supported = device.power_commands_available === true;
  return (
    <div className={"powerCommandsSetting" + (allowed ? " is-on" : "")}>
      <div className="policyToggleRow">
        <div className="labelWithHelp">
          <strong>{tr("dashboard.devices.powerCommands.label")}</strong>
          <HelpTip
            label={tr("dashboard.devices.powerCommands.about")}
            text={tr("dashboard.devices.powerCommands.help")}
          />
        </div>
        <label className="compactSwitch">
          <input
            type="checkbox"
            aria-label={tr("dashboard.devices.powerCommands.label")}
            checked={allowed}
            // An unsupported Agent can still be turned off, never on.
            disabled={powerCommandsBusyId === device.id || (!supported && !allowed)}
            onChange={(event) => void setPowerCommands(device, event.target.checked)}
          />
          <span />
        </label>
      </div>
      {allowed ? (
        <p className="powerCommandsNote is-warning" role="status">
          <ProductIcon name="shield" size={14} />
          <span>{tr("dashboard.devices.powerCommands.onNote")}</span>
        </p>
      ) : (
        <p className="powerCommandsNote">
          {supported
            ? tr("dashboard.devices.powerCommands.offNote")
            : tr("dashboard.devices.powerCommands.needsUpdate")}
        </p>
      )}
    </div>
  );
}
