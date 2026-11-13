import { useState } from "react";
import { InstallCommands } from "../../../components/install-commands.js";
import { ProductIcon } from "../../../components/product-icon.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

const dismissKey = (userId: string) => "remotearc.firstRun.dismissed:" + userId;

// Shown on Overview until the user pairs a computer (a browser extension is
// not one). Inline and dismissible, never a modal over the dashboard.
export function FirstRunCard({ m }: { m: DashboardModel }) {
  const { devices, navigateTab, setShowAdd, tr, user } = m;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey(user.id)) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed || devices.some((device) => device.platform !== "browser")) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(user.id), "1");
    } catch {
      /* The card stays hidden for this visit. */
    }
  };
  return (
    <section className="firstRunCard" aria-labelledby="first-run-title">
      <header>
        <div>
          <span className="eyebrow">{tr("dashboard.views.firstRunCard.getStarted")}</span>
          <h2 id="first-run-title">
            {tr("dashboard.views.firstRunCard.pairYourComputerSoYourAi")}
          </h2>
          <p>{tr("dashboard.views.firstRunCard.aboutAMinuteNoPublicIp")}</p>
        </div>
        <button type="button" className="ghostButton firstRunHide" onClick={dismiss}>
          {tr("dashboard.views.firstRunCard.hide")}
        </button>
      </header>
      <ol className="firstRunSteps">
        <li data-current="true">
          <strong>1 · {tr("dashboard.views.firstRunCard.installAndPair")}</strong>
          <small>{tr("dashboard.views.firstRunCard.runOneCommandOnTheComputer")}</small>
          <InstallCommands />
          <button
            type="button"
            className="addButton arcRadiantCta"
            onClick={() => setShowAdd(true)}
          >
            <ProductIcon name="add" />
            {tr("dashboard.views.firstRunCard.openThePairingGuide")}
          </button>
        </li>
        <li>
          <strong>2 · {tr("dashboard.views.firstRunCard.connectYourAi")}</strong>
          <small>{tr("dashboard.views.firstRunCard.addRemoteArcToChatgptClaude")}</small>
          <button type="button" className="ghostButton" onClick={() => navigateTab("connect")}>
            {tr("dashboard.views.firstRunCard.seeHow")}
          </button>
        </li>
        <li>
          <strong>3 · {tr("dashboard.views.firstRunCard.tryIt")}</strong>
          <small>{tr("dashboard.views.firstRunCard.askYourAiListMyRemote")}</small>
        </li>
      </ol>
    </section>
  );
}
