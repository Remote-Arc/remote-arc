import {
  DEVELOPER_DEVICE_TOOLS,
  DEVICE_TOOL_CATALOG,
  SAFE_DEVICE_TOOLS,
} from "../dashboard/devices/device-presets.js";
import { INSTALL_METHODS } from "../../components/install-commands.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/docs/device-pairing-guide.css";

const command = (id: (typeof INSTALL_METHODS)[number]["id"]) =>
  INSTALL_METHODS.find((method) => method.id === id)!.command;
const added = (tools: readonly string[], base: readonly string[]) =>
  tools.filter((tool) => !base.includes(tool));

// The presets a paired computer can use, built from the same tool lists the
// Dashboard applies, so the docs cannot drift from what each preset enables.
const PRESETS = [
  {
    id: "safe",
    name: "Safe",
    summary: "docs.devicePairingGuide.safeSummary",
    tools: SAFE_DEVICE_TOOLS,
    adds: false,
  },
  {
    id: "developer",
    name: "Developer",
    summary: "docs.devicePairingGuide.developerSummary",
    tools: added(DEVELOPER_DEVICE_TOOLS, SAFE_DEVICE_TOOLS),
    adds: true,
  },
  {
    id: "full",
    name: "Full",
    summary: "docs.devicePairingGuide.fullSummary",
    tools: added(DEVICE_TOOL_CATALOG, DEVELOPER_DEVICE_TOOLS),
    adds: true,
  },
] as const;

/** Install, approve and choose a preset: the steps a reader needs before the policy details. */
export function DevicePairingGuide() {
  const { tr, locale } = useI18n();
  return (
    <div className="devicePairingGuide" id="pair-a-computer">
      <h3>{tr("docs.devicePairingGuide.title")}</h3>
      <p>{tr("docs.devicePairingGuide.intro")}</p>
      <ol className="devicePairingSteps">
        <li>
          <strong>{tr("docs.devicePairingGuide.installTitle")}</strong>
          <p>{tr("docs.devicePairingGuide.installCurl")}</p>
          <pre className="docsExample">
            <code>{command("curl")}</code>
          </pre>
          <p>{tr("docs.devicePairingGuide.installNpx")}</p>
          <pre className="docsExample">
            <code>{command("npx")}</code>
          </pre>
          <p>
            <a href={localizedWebsiteHref("/downloads", locale) + "#native-downloads"}>
              {tr("docs.devicePairingGuide.installWindows")} →
            </a>
          </p>
        </li>
        <li>
          <strong>{tr("docs.devicePairingGuide.approveTitle")}</strong>
          <p>{tr("docs.devicePairingGuide.approveText")}</p>
        </li>
        <li>
          <strong>{tr("docs.devicePairingGuide.presetTitle")}</strong>
          <p>{tr("docs.devicePairingGuide.presetText")}</p>
        </li>
      </ol>
      <div
        className="devicePresetPreview"
        role="list"
        aria-label={tr("docs.devicePairingGuide.presetsLabel")}
      >
        {PRESETS.map((preset) => (
          <article key={preset.id} role="listitem" data-preset={preset.id}>
            <strong>{preset.name}</strong>
            <p>{tr(preset.summary)}</p>
            <span className="devicePresetToolsLabel">
              {preset.adds
                ? tr("docs.devicePairingGuide.addsTools")
                : tr("docs.devicePairingGuide.enablesTools")}
            </span>
            <ul>
              {preset.tools.map((tool) => (
                <li key={tool}>
                  <code>{tool}</code>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
