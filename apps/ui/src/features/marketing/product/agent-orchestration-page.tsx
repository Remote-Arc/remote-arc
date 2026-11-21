import { useI18n } from "../../../hooks/use-i18n.js";
import { dashboardHref } from "../../../config/app-config.js";
import { FeaturePage } from "./feature-page.js";

/** Two agents at work and the quota strip, as the Dashboard shows them. */
function OrchestrationPicture() {
  const { tr } = useI18n();
  return (
    <div className="featureMock" aria-label={tr("marketing.agentOrchestration.pictureLabel")}>
      <div className="featureMockQuota">
        <span>Claude Code</span>
        <span>
          {tr("marketing.agentOrchestration.fiveHour")} <strong>34%</strong>
        </span>
        <span>
          {tr("marketing.agentOrchestration.sevenDay")} <strong>21%</strong>
        </span>
      </div>
      <div className="featureMockRow">
        <header>
          <strong>{tr("marketing.agentOrchestration.mockFixTitle")}</strong>
          <span className="featureMockState is-done">
            {tr("marketing.agentOrchestration.replied")}
          </span>
        </header>
        <small>Claude Code · MacBook · ra/agent-3f2b</small>
        <span className="featureMockTool">✓ Bash npm test -- date-parser</span>
        <span className="featureMockTool">✓ Edit src/date/parse.ts</span>
        <span>{tr("marketing.agentOrchestration.mockFixReply")}</span>
      </div>
      <div className="featureMockRow">
        <header>
          <strong>{tr("marketing.agentOrchestration.mockPageTitle")}</strong>
          <span className="featureMockState">{tr("marketing.agentOrchestration.working")}</span>
        </header>
        <small>Codex · Windows PC · ra/agent-9c1d</small>
        <span className="featureMockTool">✓ Edit src/routes/orders.ts</span>
        <span className="featureMockTool">• Command npm test -- orders</span>
      </div>
    </div>
  );
}

/** The public page for Agent Orchestration. */
export function AgentOrchestrationPage() {
  const { tr } = useI18n();
  return (
    <FeaturePage
      id="agent-orchestration"
      eyebrow={tr("marketing.agentOrchestration.eyebrow")}
      title={tr("marketing.agentOrchestration.title")}
      lede={tr("marketing.agentOrchestration.lede")}
      start={{
        label: tr("marketing.agentOrchestration.start"),
        href: dashboardHref("/dashboard/connect/orchestration"),
      }}
      docs={{ label: tr("marketing.agentOrchestration.docs"), href: "/docs/agent-orchestration" }}
      visual={<OrchestrationPicture />}
      steps={[
        {
          title: tr("marketing.agentOrchestration.stepOneTitle"),
          text: tr("marketing.agentOrchestration.stepOneText"),
        },
        {
          title: tr("marketing.agentOrchestration.stepTwoTitle"),
          text: tr("marketing.agentOrchestration.stepTwoText"),
        },
        {
          title: tr("marketing.agentOrchestration.stepThreeTitle"),
          text: tr("marketing.agentOrchestration.stepThreeText"),
        },
      ]}
      plans={{
        title: tr("marketing.agentOrchestration.plansTitle"),
        note: tr("marketing.agentOrchestration.plansNote"),
        rows: [
          { plan: "free", text: tr("marketing.agentOrchestration.plansFree") },
          { plan: "pro", text: tr("marketing.agentOrchestration.plansPro") },
          { plan: "max", text: tr("marketing.agentOrchestration.plansMax") },
        ],
      }}
      details={[
        {
          title: tr("marketing.agentOrchestration.worktreesTitle"),
          text: tr("marketing.agentOrchestration.worktreesText"),
        },
        {
          title: tr("marketing.agentOrchestration.safetyTitle"),
          text: tr("marketing.agentOrchestration.safetyText"),
        },
        {
          title: tr("marketing.agentOrchestration.yourAgentsTitle"),
          text: tr("marketing.agentOrchestration.yourAgentsText"),
        },
      ]}
      related={[
        {
          label: tr("marketing.agentOrchestration.relatedDocs"),
          href: "/docs/agent-orchestration",
        },
        { label: tr("marketing.agentOrchestration.relatedDevices"), href: "/docs/devices" },
        { label: tr("marketing.agentOrchestration.relatedPricing"), href: "/pricing" },
      ]}
    />
  );
}
