import { useI18n } from "../../../hooks/use-i18n.js";
import { FLEET_OFFLINE, FLEET_SIZE, FLEET_WARN } from "./home-use-cases-data.js";
import "../../../styles/marketing/home/home-three-steps.css";

const AI_ICONS = [
  { name: "ChatGPT", icon: "/ai-openai.svg" },
  { name: "Claude", icon: "/ai-claude.svg" },
  { name: "Gemini", icon: "/ai-gemini-four-color-2025.svg" },
  { name: "Cursor", icon: "/ai-cursor.svg" },
];
const key = <Name extends string>(name: Name) => `marketing.home.threeSteps.${name}` as const;

/**
 * How one request runs, in three panels: you ask in any AI, Remote Arc checks
 * it against what you allowed, and your computers run it. The example is the
 * server-room check from "Ask in chat", so the numbers match.
 */
export function HomeThreeSteps() {
  const { tr } = useI18n();
  const healthy = FLEET_SIZE - FLEET_WARN.size - FLEET_OFFLINE.size;
  const checks = [
    { label: tr(key("checkScope")), allowed: true },
    { label: tr(key("checkPolicy")), allowed: true },
    { label: tr(key("checkTool"), { count: FLEET_SIZE }), allowed: true },
    { label: tr(key("checkRestart")), allowed: false },
  ];
  return (
    <ol className="homeThreeSteps" aria-label={tr(key("label"))}>
      <li>
        <h3>
          <b>1</b>
          {tr(key("askTitle"))}
        </h3>
        <p className="homeThreeStepsBubble">{tr(key("askPrompt"))}</p>
        <span className="homeThreeStepsClients">
          {AI_ICONS.map((client) => (
            <img key={client.name} src={client.icon} alt={client.name} width={18} height={18} />
          ))}
        </span>
      </li>
      <li>
        <h3>
          <b>2</b>
          {tr(key("checkTitle"))}
        </h3>
        <ul className="homeThreeStepsChecks">
          {checks.map((check) => (
            <li key={check.label} data-allowed={check.allowed}>
              <span>{check.label}</span>
              <em>{check.allowed ? "✓ " + tr(key("allowed")) : tr(key("asksFirst"))}</em>
            </li>
          ))}
        </ul>
      </li>
      <li>
        <h3>
          <b>3</b>
          {tr(key("runTitle"))}
        </h3>
        <pre className="homeThreeStepsTerm">
          <span className="dim">$</span> uptime &amp;&amp; df -h /{"   "}
          <span className="dim">· {tr(key("runMachines"), { count: FLEET_SIZE })}</span>
          {"\n"}
          <span className="ok">✓</span> {tr(key("runHealthy"), { count: healthy })}
          {"\n"}
          <span className="warn">!</span> {tr(key("runDisk"), { count: FLEET_WARN.size })}
          {"\n"}
          <span className="dim">–</span> {tr(key("runOffline"), { count: FLEET_OFFLINE.size })}
          {"\n"}
          <span className="dim">{tr(key("runDone"))}</span>
        </pre>
      </li>
    </ol>
  );
}
