import { useEffect, useRef, useState } from "react";
import { MARKETING_ORIGIN } from "../../../config/app-config.js";
import { CopyButton } from "../../../components/public-layout.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

type Platform = "darwin" | "windows" | "linux";
const CURL = "curl -fsSL https://remotearc.app/install.sh | sh";

// The computer being paired is usually the one showing this page.
function currentPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const value = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /win/i.test(value)
    ? "windows"
    : /linux|x11|cros/i.test(value) && !/android/i.test(value)
      ? "linux"
      : "darwin";
}

function Command({ value }: { value: string }) {
  return (
    <div className="commandBox">
      <code>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

export function AddDeviceDialog({ m }: { m: DashboardModel }) {
  const { command, locale, setShowAdd, tr } = m;
  const [platform, setPlatform] = useState<Platform>(currentPlatform);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAdd(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShowAdd]);
  const site = MARKETING_ORIGIN + (locale === "zh" ? "/zh" : "");
  const download = (arch: string) =>
    MARKETING_ORIGIN + "/api/downloads/agent/" + platform + "/" + arch;
  const tabs: [Platform, string][] = [
    ["darwin", "macOS"],
    ["windows", "Windows"],
    ["linux", "Linux"],
  ];
  const npx = (
    <>
      <div className="commandLabel secondary">
        {tr("dashboard.views.addDeviceDialog.withNodeJsInstalled")}
      </div>
      <Command value={command} />
    </>
  );
  return (
    <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
      <section
        className="modal addDeviceModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-device-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={close}
          className="modalClose"
          aria-label={tr("dashboard.views.addDeviceDialog.close")}
          onClick={() => setShowAdd(false)}
        >
          ×
        </button>
        <span className="eyebrow">{tr("dashboard.views.addDeviceDialog.addADevice")}</span>
        <h2 id="add-device-title">{tr("dashboard.views.addDeviceDialog.connectAComputer")}</h2>
        <p>{tr("dashboard.views.addDeviceDialog.runTheRemoteArcAgentOn")}</p>
        <div
          className="addDevicePlatforms"
          role="tablist"
          aria-label={tr("dashboard.views.addDeviceDialog.operatingSystem")}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={platform === id}
              onClick={() => setPlatform(id)}
            >
              <img
                src={"/platform-brands/" + (id === "darwin" ? "macos" : id) + ".svg"}
                width="18"
                height="18"
                alt=""
              />
              {label}
            </button>
          ))}
        </div>
        <div className="addDevicePanel" role="tabpanel">
          {platform === "windows" ? (
            <>
              <div className="commandLabel">
                {tr("dashboard.views.addDeviceDialog.recommendedDownloadTheInstaller")}
              </div>
              <div className="addDeviceDownloads">
                <a className="addButton" href={download("amd64")}>
                  {tr("dashboard.views.addDeviceDialog.downloadForWindowsX64")}
                </a>
                <a className="ghostButton" href={download("arm64")}>
                  ARM64
                </a>
              </div>
              <small className="addDeviceHint">
                {tr("dashboard.views.addDeviceDialog.runTheDownloadedExeMostIntel")}
              </small>
              {npx}
              <small className="addDeviceHint">
                {tr("dashboard.views.addDeviceDialog.runItInPowershellOrWindows")}
              </small>
            </>
          ) : (
            <>
              <div className="commandLabel">
                {tr("dashboard.views.addDeviceDialog.recommendedNoNodeJsNeeded")}
              </div>
              <Command value={CURL} />
              <small className="addDeviceHint">
                {tr("dashboard.views.addDeviceDialog.installsVerifiesAndStartsTheAgent")}
              </small>
              {npx}
              <a
                className="addDeviceMore"
                href={
                  site + "/downloads" + (platform === "darwin" ? "#homebrew" : "#native-downloads")
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {platform === "darwin"
                  ? tr("dashboard.views.addDeviceDialog.homebrewOrDirectDownload")
                  : tr("dashboard.views.addDeviceDialog.directDownloadX64Arm64")}{" "}
                →
              </a>
            </>
          )}
        </div>
        <details className="addDeviceSafe">
          <summary>
            {tr("dashboard.views.addDeviceDialog.optionalKeepThisComputerReadOnly")}
          </summary>
          <p>{tr("dashboard.views.addDeviceDialog.addSafeWhenStartingTheAgent")}</p>
        </details>
        <div className="onboardingSteps">
          <div>
            <b>1</b>
            <span>
              <strong>{tr("dashboard.views.addDeviceDialog.startTheAgent")}</strong>
              <small>{tr("dashboard.views.addDeviceDialog.yourBrowserOpensThePairingPage")}</small>
            </span>
          </div>
          <div>
            <b>2</b>
            <span>
              <strong>
                {tr("dashboard.views.addDeviceDialog.matchTheCodeAndChoosePermissions")}
              </strong>
              <small>{tr("dashboard.views.addDeviceDialog.signInWithThisSameRemote")}</small>
            </span>
          </div>
          <div>
            <b>3</b>
            <span>
              <strong>{tr("dashboard.views.addDeviceDialog.itAppearsHere")}</strong>
              <small>{tr("dashboard.views.addDeviceDialog.keepTheAgentRunningThenConnect")}</small>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
