import React, { useEffect } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { InstallCommands } from "../../components/install-commands.js";
import { LATEST_AGENT_VERSION } from "../dashboard/format.js";
import "../../styles/public-docs.css";
import "../../styles/install/native-install.css";

// Served by Remote Arc's own release mirror, checked against the release manifest.
const checksums = `/api/downloads/release/remotelink-v${LATEST_AGENT_VERSION}/SHA256SUMS`;
const platforms = [
  {
    id: "darwin",
    icon: "macos",
    name: "macOS",
    choices: [
      { arch: "arm64", label: "Apple Silicon", detail: "ARM64" },
      { arch: "amd64", label: "Intel", detail: "x64" },
    ],
  },
  {
    id: "windows",
    icon: "windows",
    name: "Windows",
    choices: [
      { arch: "amd64", label: "x64", detail: "Intel / AMD" },
      { arch: "arm64", label: "ARM64", detail: "ARM" },
    ],
  },
  {
    id: "linux",
    icon: "linux",
    name: "Linux",
    choices: [
      { arch: "amd64", label: "x64", detail: "Intel / AMD" },
      { arch: "arm64", label: "ARM64", detail: "ARM" },
    ],
  },
] as const;

function DownloadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M10 3v9m-3-3 3 3 3-3M4 13v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NativeInstall() {
  const { tr, locale } = useI18n();
  useEffect(() => {
    let frame: number | undefined;
    const alignFragment = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hash = window.location.hash;
        if (
          [
            "#homebrew",
            "#shell-install",
            "#npx-install",
            "#terminal-install",
            "#native-downloads",
          ].includes(hash)
        ) {
          const target = document.getElementById(hash.slice(1));
          if (target instanceof HTMLDetailsElement) target.open = true;
          target?.scrollIntoView({ block: "start" });
        }
      });
    };
    alignFragment();
    window.addEventListener("hashchange", alignFragment);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", alignFragment);
    };
  }, []);

  return (
    <section id="agent-downloads" className="nativeInstall">
      <header className="nativeInstallHeader">
        <span className="eyebrow">REMOTE ARC · {tr("install.nativeInstall.latestStable")}</span>
        <h1>{tr("install.nativeInstall.downloadRemoteArc")}</h1>
        <p>{tr("install.nativeInstall.installFromTerminalOrChooseA")}</p>
        <nav
          className="nativeInstallActions"
          aria-label={tr("install.nativeInstall.installationShortcuts")}
        >
          <a className="nativeDownloadAction" href="#native-downloads">
            <DownloadIcon />
            {tr("install.nativeInstall.downloadForYourComputer")}
          </a>
          <a href="#terminal-install">
            {tr("install.nativeInstall.installFromTerminal")} <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section
        id="terminal-install"
        className="nativeInstallQuick"
        aria-labelledby="terminal-install-heading"
      >
        <div className="nativeQuickIntro">
          <h2 id="terminal-install-heading">{tr("install.nativeInstall.quickInstall")}</h2>
          <p>{tr("install.nativeInstall.copyACommandAndRunIt")}</p>
        </div>
        <div id="shell-install" className="nativeQuickCommands">
          <span id="npx-install" />
          <InstallCommands downloadHref="#native-downloads" followHash />
          <a className="nativeScriptLink" href="/install.sh">
            {tr("install.nativeInstall.readTheCurlInstallationScript")} →
          </a>
        </div>
      </section>

      <div className="nativeDownloadSectionHeading">
        <h2>{tr("install.nativeInstall.downloadForYourComputer2")}</h2>
        <p>{tr("install.nativeInstall.nativeAgentNoNodeJsRequired")}</p>
      </div>
      <ul id="native-downloads" className="nativeDownloads">
        {platforms.map((platform) => (
          <li key={platform.id} className="nativeDownloadCard">
            <div className="nativeDownloadHeading">
              <span className="nativePlatformIcon">
                <img src={`/platform-brands/${platform.icon}.svg`} width="32" height="32" alt="" />
              </span>
              <div>
                <h2>{platform.name}</h2>
                <span>{tr("install.nativeInstall.nativeAgent")}</span>
              </div>
            </div>
            <div className="nativeDownloadChoices">
              {platform.id === "darwin" ? (
                <a className="nativeShellChoice" href="#shell-install">
                  <span>
                    <strong>{tr("install.nativeInstall.installWithCurl")}</strong>
                    <small>Apple Silicon · Intel</small>
                  </span>
                  <DownloadIcon />
                </a>
              ) : (
                platform.choices.map((choice) => (
                  <a
                    key={choice.arch}
                    href={`/api/downloads/agent/${platform.id}/${choice.arch}`}
                    aria-label={tr("install.nativeInstall.downloadFor", {
                      name: platform.name,
                      label: choice.label,
                    })}
                  >
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.detail}</small>
                    </span>
                    <DownloadIcon />
                  </a>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="nativeDownloadMeta">
        <span>{tr("install.nativeInstall.everyDownloadFollowsTheLatestStable")}</span>
        <div>
          <a href={checksums}>SHA256SUMS</a>
          <span aria-hidden="true">·</span>
          <a href={localizedWebsiteHref("/releases", locale)}>
            {tr("install.nativeInstall.releaseNotes")}
          </a>
        </div>
      </div>

      <section className="nativeInstallStart">
        <h2>{tr("install.nativeInstall.runTheAgentThenPairYour")}</h2>
        <p>{tr("install.nativeInstall.useTheSameRemoteArcAccount")}</p>
        <div className="nativeStartGuides">
          <details>
            <summary>
              <img src="/platform-brands/macos.svg" width="20" height="20" alt="" />
              {tr("install.nativeInstall.startingOnMacos")}
            </summary>
            <ol>
              <li>
                <a href="#shell-install">
                  {tr("install.nativeInstall.copyTheCurlInstallationCommandAbove")}
                </a>
                {tr("install.nativeInstall.andRunItInTerminalIt")}
              </li>
              <li>{tr("install.nativeInstall.runTheStartupCommandPrintedBy")}</li>
            </ol>
          </details>
          <details>
            <summary>
              <img src="/platform-brands/windows.svg" width="20" height="20" alt="" />
              {tr("install.nativeInstall.startingOnWindows")}
            </summary>
            <p>{tr("install.nativeInstall.runTheDownloadedExeOnThe")}</p>
          </details>
          <details>
            <summary>
              <img src="/platform-brands/linux.svg" width="20" height="20" alt="" />
              {tr("install.nativeInstall.startingOnLinux")}
            </summary>
            <p>{tr("install.nativeInstall.makeTheDownloadedFileExecutableWith")}</p>
          </details>
        </div>
      </section>

      <section className="nativeInstallOther">
        <h2>{tr("install.nativeInstall.otherInstallationMethods")}</h2>
        <details>
          <summary>
            <span>{tr("install.nativeInstall.commandLineInstallationNotes")}</span>
          </summary>
          <p>{tr("install.nativeInstall.curlInstallsTheLatestStableNative")}</p>
          <p>{tr("install.nativeInstall.npxRequiresNodeJsOnThe")}</p>
        </details>
        <details id="homebrew">
          <summary>
            <span>Homebrew</span>
            <small>macOS · Linux</small>
          </summary>
          <pre className="docsExample">
            <code>
              {
                "brew tap remote-arc/remote-arc https://github.com/Remote-Arc/remote-arc\nif brew command trust >/dev/null 2>&1; then brew trust --formula remote-arc/remote-arc/remotelink remote-arc/remote-arc/remotelink-go; fi\nbrew install remote-arc/remote-arc/remotelink\nremotelink"
              }
            </code>
          </pre>
          <p>{tr("install.nativeInstall.nodeJsIsNotRequiredExisting")}</p>
        </details>
        <details>
          <summary>
            <span>{tr("install.nativeInstall.advancedMacosCommandLineBinaries")}</span>
          </summary>
          <p>{tr("install.nativeInstall.theseAreStandaloneCommandLineExecutables")}</p>
          <div className="nativeDownloadChoices">
            {platforms[0].choices.map((choice) => (
              <a
                key={choice.arch}
                href={`/api/downloads/agent/darwin/${choice.arch}`}
                aria-label={tr("install.nativeInstall.downloadForMacos", { label: choice.label })}
              >
                <span>
                  <strong>{choice.label}</strong>
                  <small>{choice.detail}</small>
                </span>
                <DownloadIcon />
              </a>
            ))}
          </div>
        </details>
        <details>
          <summary>
            <span>{tr("install.nativeInstall.upgradeStopAndCompatibility")}</span>
          </summary>
          <p>{tr("install.nativeInstall.stopTheCurrentAgentBeforeUpgrading")}</p>
          <pre className="docsExample">
            <code>{"npx remotelink@latest --stop\nnpx remotelink@latest --foreground"}</code>
          </pre>
        </details>
      </section>
      <footer className="nativeInstallFooter">
        <a href="https://agent.remotearc.app/devices">
          {tr("install.nativeInstall.manageYourComputers")} →
        </a>
        <a href={localizedWebsiteHref("/connect-ai", locale)}>
          {tr("install.nativeInstall.connectYourAi")} →
        </a>
      </footer>
    </section>
  );
}
