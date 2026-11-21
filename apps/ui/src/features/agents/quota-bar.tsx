import { useI18n } from "../../hooks/use-i18n.js";
import type { AgentRateLimit } from "../../hooks/agents/use-agent-runs.js";

const WINDOW_LABELS = {
  five_hour: "orchestration.quota.fiveHour",
  seven_day: "orchestration.quota.sevenDay",
} as const;

/**
 * The person's Claude subscription windows, as Claude Code last reported them
 * during a run. Codex does not report its limits, so it is not shown here.
 */
export function QuotaBar({ claude }: { claude: AgentRateLimit | null }) {
  const { tr, locale } = useI18n();
  if (!claude || !claude.windows.length) return null;
  const time = (value: string) =>
    new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section className="orchQuota" aria-label={tr("orchestration.quota.title")}>
      <span className="orchQuotaName">{tr("orchestration.agent.claude")}</span>
      {claude.windows.map((window) => {
        const percent = Math.round(window.utilization * 100);
        const label = WINDOW_LABELS[window.name as keyof typeof WINDOW_LABELS];
        return (
          <div className="orchQuotaWindow" key={window.name}>
            <span>{label ? tr(label) : window.name}</span>
            <meter min={0} max={100} low={70} high={90} optimum={0} value={percent} />
            <strong>{percent}%</strong>
            <small>{tr("orchestration.quota.resets", { time: time(window.resets_at) })}</small>
          </div>
        );
      })}
    </section>
  );
}
