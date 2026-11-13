import { PRO_CHECKOUT_SLUG } from "@remotearc/protocol";
import { useI18n } from "../../../hooks/use-i18n.js";
import { useComputerPlanLimit } from "../../../hooks/dashboard/use-computer-plan-limit.js";
import { platformLabel } from "./device-presets.js";
import type { Device } from "../../../types/app-types.js";
import "../../../styles/dashboard/devices/computer-plan-limit.css";

// Shown when the account has more computers than its plan allows. Paused
// computers stay paired; the person picks which ones stay active, or
// subscribes to Pro to use them all.
export function ComputerPlanLimit({
  devices,
  refreshAll,
}: {
  devices: Device[];
  refreshAll: () => Promise<void>;
}) {
  const { tr } = useI18n();
  const plan = useComputerPlanLimit({ devices, refreshAll });
  if (!plan.paused.length || plan.limit === null) return null;
  const checkoutHref = "/checkout?product=" + PRO_CHECKOUT_SLUG;

  return (
    <section className="computerPlanLimit" aria-labelledby="computer-plan-limit-title">
      <div className="computerPlanLimitCopy">
        <h2 id="computer-plan-limit-title">
          {tr("dashboard.devices.computerPlanLimit.pausedTitle", {
            paused: plan.paused.length,
            total: plan.computers.length,
          })}
        </h2>
        <p>{tr("dashboard.devices.computerPlanLimit.pausedExplanation", { limit: plan.limit })}</p>
      </div>
      <div className="computerPlanLimitActions">
        {!plan.choosing && (
          <button type="button" className="ghostButton" onClick={plan.startChoosing}>
            {tr("dashboard.devices.computerPlanLimit.chooseActive")}
          </button>
        )}
        <a className="goldButton" href={checkoutHref}>
          {tr("dashboard.devices.computerPlanLimit.getPro")}
        </a>
      </div>

      {plan.choosing && (
        <div className="computerPlanLimitChooser">
          <p className="computerPlanLimitHint">
            {tr("dashboard.devices.computerPlanLimit.chooseHint", {
              selected: plan.selected.length,
              limit: plan.limit,
            })}
          </p>
          <ul>
            {plan.computers.map((device) => {
              const checked = plan.selected.includes(device.id);
              const full = !checked && plan.selected.length >= (plan.limit ?? 0);
              return (
                <li key={device.id}>
                  <label className={full ? "disabled" : ""}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={full || plan.saving}
                      onChange={() => plan.toggle(device.id)}
                    />
                    <span className="computerPlanLimitName">{device.name}</span>
                    <span className="computerPlanLimitMeta">
                      {platformLabel(device.platform)}
                      {device.hostname ? " · " + device.hostname : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {plan.failed && (
            <p className="computerPlanLimitError" role="alert">
              {plan.failed === "changed"
                ? tr("dashboard.devices.computerPlanLimit.listChanged")
                : tr("dashboard.devices.computerPlanLimit.saveFailed")}
            </p>
          )}
          <div className="computerPlanLimitChooserActions">
            <button
              type="button"
              className="ghostButton"
              disabled={plan.saving}
              onClick={plan.cancelChoosing}
            >
              {tr("dashboard.devices.computerPlanLimit.cancel")}
            </button>
            <button
              type="button"
              className="goldButton"
              disabled={plan.saving || plan.selected.length === 0}
              onClick={() => void plan.save()}
            >
              {plan.saving
                ? tr("dashboard.devices.computerPlanLimit.saving")
                : tr("dashboard.devices.computerPlanLimit.save")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
