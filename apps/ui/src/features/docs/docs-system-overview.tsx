import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/docs/docs-system-overview.css";

/**
 * Public "how Remote Arc runs" overview for /docs and /docs/architecture.
 * Mirrors ARCHITECTURE.md at a public level of detail: components, gates and
 * execution paths only. Never add internal costs, provider terms, secret names
 * or abuse thresholds here. `pnpm docs:architecture:check` guards the link.
 */
export function SystemOverview({ guideLink = true }: { guideLink?: boolean }) {
  const { tr, locale } = useI18n();
  const href = (path: string) => localizedWebsiteHref(path, locale);
  const lanes = [
    {
      label: tr("docs.docsSystemOverview.decide"),
      nodes: [
        [tr("docs.docsSystemOverview.yourAiClient"), "ChatGPT · Claude · Codex · MCP"],
        [
          tr("docs.docsSystemOverview.arcWorkspace"),
          tr("docs.docsSystemOverview.hostedModelsCreditsBudget"),
        ],
      ],
    },
    {
      label: tr("docs.docsSystemOverview.controlPlane"),
      nodes: [
        [
          tr("docs.docsSystemOverview.signInAndOauth"),
          tr("docs.docsSystemOverview.sessionsScopedClientGrants"),
        ],
        [
          tr("docs.docsSystemOverview.plansAndPolicy"),
          tr("docs.docsSystemOverview.allowancesDeviceOwnershipToolPolicy"),
        ],
        [
          tr("docs.docsSystemOverview.tasksAndScheduler"),
          tr("docs.docsSystemOverview.storedContractsLeasesRevisions"),
        ],
        [
          tr("docs.docsSystemOverview.perAccountRouting"),
          tr("docs.docsSystemOverview.durableObjectsForwardingOnly"),
        ],
      ],
    },
    {
      label: tr("docs.docsSystemOverview.execute"),
      nodes: [
        [
          tr("docs.docsSystemOverview.connectedApps"),
          tr("docs.docsSystemOverview.typedOperationsOnYourProviderAccounts"),
        ],
        [
          tr("docs.docsSystemOverview.yourComputer"),
          tr("docs.docsSystemOverview.goAgentExecutionCore"),
        ],
        [
          tr("docs.docsSystemOverview.yourBrowser"),
          tr("docs.docsSystemOverview.chromeCompanionTaskBrowser"),
        ],
      ],
    },
  ];
  const steps = [
    [
      tr("docs.docsSystemOverview.authenticate"),
      tr("docs.docsSystemOverview.theAiClientCallsTheMcp"),
      "OAuth 2.1 · PKCE",
    ],
    [
      tr("docs.docsSystemOverview.authorize"),
      tr("docs.docsSystemOverview.theControlPlaneChecksTheScope"),
      tr("docs.docsSystemOverview.scopePlanDevice"),
    ],
    [
      tr("docs.docsSystemOverview.route"),
      tr("docs.docsSystemOverview.yourAccountSDurableObjectForwards"),
      tr("docs.docsSystemOverview.outboundWss"),
    ],
    [
      tr("docs.docsSystemOverview.checkLocally"),
      tr("docs.docsSystemOverview.theAgentReChecksThePermission"),
      tr("docs.docsSystemOverview.pathsSafetyGuard"),
    ],
    [
      tr("docs.docsSystemOverview.executeAndRecord"),
      tr("docs.docsSystemOverview.theExecutionCoreRunsTheTool"),
      tr("docs.docsSystemOverview.undoActivity"),
    ],
    [
      tr("docs.docsSystemOverview.decideAgain"),
      tr("docs.docsSystemOverview.theAiSeesTheRealResult"),
      tr("docs.docsSystemOverview.evidenceNotAssumptions"),
    ],
  ];
  const paths = [
    [
      tr("docs.docsSystemOverview.liveToolCall"),
      tr("docs.docsSystemOverview.yourAiClientTurnByTurn"),
      tr("docs.docsSystemOverview.nothingBeyondTheResultAndActivity"),
    ],
    [
      tr("docs.docsSystemOverview.arcRun"),
      tr("docs.docsSystemOverview.arcSHostedModelInsideA"),
      tr("docs.docsSystemOverview.encryptedConversationMemoryAndRunHistory"),
    ],
    [
      tr("docs.docsSystemOverview.durableTask"),
      tr("docs.docsSystemOverview.theApprovedContractFreshJudgmentOnly"),
      tr("docs.docsSystemOverview.contractScheduleLeaseAndBoundedResults"),
    ],
  ];
  return (
    <section className="systemOverview" id="docs-how-it-runs" aria-labelledby="systemOverviewTitle">
      <header>
        <span className="eyebrow">{tr("docs.docsSystemOverview.howRemoteArcRuns")}</span>
        <h2 id="systemOverviewTitle">{tr("docs.docsSystemOverview.fromAnAiDecisionToAn")}</h2>
        <p>{tr("docs.docsSystemOverview.remoteArcIsNotRemoteDesktop")}</p>
      </header>
      <div
        className="systemLanes"
        role="list"
        aria-label={tr("docs.docsSystemOverview.systemComponents")}
      >
        {lanes.map((lane, index) => (
          <React.Fragment key={lane.label}>
            {index > 0 && (
              <span className="systemLaneArrow" aria-hidden="true">
                →
              </span>
            )}
            <div className="systemLane" role="listitem">
              <span>{lane.label}</span>
              {lane.nodes.map(([name, detail]) => (
                <div key={name}>
                  <strong>{name}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <p className="systemNote">
        {tr("docs.docsSystemOverview.computersAndTheBrowserExtensionConnect")}
      </p>
      <p>{tr("docs.docsSystemOverview.operationsUseConnectionCountsGroupedBy")}</p>
      <h3>{tr("docs.docsSystemOverview.theLifeOfOneToolCall")}</h3>
      <ol className="systemSteps">
        {steps.map(([title, text, gate], index) => (
          <li key={title}>
            <span className="systemStepIndex">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
            <code>{gate}</code>
          </li>
        ))}
      </ol>
      <h3>{tr("docs.docsSystemOverview.threeWaysWorkRuns")}</h3>
      <div className="docsTableWrap">
        <table className="articleTable">
          <thead>
            <tr>
              <th>{tr("docs.docsSystemOverview.path")}</th>
              <th>{tr("docs.docsSystemOverview.whoDecides")}</th>
              <th>{tr("docs.docsSystemOverview.whatPersists")}</th>
            </tr>
          </thead>
          <tbody>
            {paths.map(([path, who, kept]) => (
              <tr key={path}>
                <td>{path}</td>
                <td>{who}</td>
                <td>{kept}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="systemNote">{tr("docs.docsSystemOverview.allThreePathsPassTheSame")}</p>
      <nav
        className="systemLinks"
        aria-label={tr("docs.docsSystemOverview.architectureReferences")}
      >
        {guideLink && (
          <a href={href("/docs/architecture")}>
            {tr("docs.docsSystemOverview.architectureDeepDive")} →
          </a>
        )}
        <a href={href("/security-model")}>{tr("docs.docsSystemOverview.securityModel")} →</a>
        <a href={href("/docs/tools")}>{tr("docs.docsSystemOverview.allTools")} →</a>
      </nav>
    </section>
  );
}
