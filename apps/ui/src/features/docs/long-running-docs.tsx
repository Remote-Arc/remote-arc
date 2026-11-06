import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { TaskAvailability } from "./product-docs.js";

export function LongRunningWorkDocs() {
  const { tr } = useI18n();
  return (
    <main className="technicalDoc productDocs">
      <header className="articleHeader">
        <span className="eyebrow">{tr("docs.longRunningDocs.documentationDurableTasks")}</span>
        <h1>{tr("docs.longRunningDocs.tasksRoutinesAndLongRunningWork")}</h1>
        <p>{tr("docs.longRunningDocs.arcTasksAndRoutinesRunBounded")}</p>
        <div className="articleMetaLinks">
          <a href="/docs">{tr("docs.longRunningDocs.allDocumentation")} →</a>
          <a href="/security-model">{tr("docs.longRunningDocs.securityModel")} →</a>
          <a href="/use-cases">{tr("docs.longRunningDocs.useCases")} →</a>
        </div>
      </header>
      <TaskAvailability />
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("docs.longRunningDocs.contents")}</strong>
          {[
            ["boundary", tr("docs.longRunningDocs.whatPersists")],
            ["modes", tr("docs.longRunningDocs.supportedTaskModes")],
            ["limits", tr("docs.longRunningDocs.whereAiReasoningStops")],
            ["recovery", tr("docs.longRunningDocs.reconnectAndRecovery")],
            ["security", tr("docs.longRunningDocs.permissions")],
          ].map(([id, title]) => (
            <a key={id} href={"#work-" + id}>
              {title}
            </a>
          ))}
        </aside>
        <article className="technicalArticle">
          <section id="work-boundary">
            <h2>{tr("docs.longRunningDocs.chooseArcOrConnectForSaved")}</h2>
            <p>{tr("docs.longRunningDocs.aChatCanAuthorizeAndSave")}</p>
            <p>{tr("docs.longRunningDocs.arcStartsABoundedHostedModel")}</p>
          </section>

          <section id="work-modes">
            <h2>{tr("docs.longRunningDocs.connectTaskModes")}</h2>
            <div className="tableScroll">
              <table>
                <thead>
                  <tr>
                    <th>{tr("docs.longRunningDocs.mode")}</th>
                    <th>{tr("docs.longRunningDocs.whatPersists2")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{tr("docs.longRunningDocs.longTask")}</td>
                    <td>{tr("docs.longRunningDocs.startAndTrackOneApprovedCommand")}</td>
                  </tr>
                  <tr>
                    <td>{tr("docs.longRunningDocs.scheduledTask")}</td>
                    <td>{tr("docs.longRunningDocs.runApprovedDeterministicWorkAtA")}</td>
                  </tr>
                  <tr>
                    <td>{tr("docs.longRunningDocs.conditionWatch")}</td>
                    <td>{tr("docs.longRunningDocs.waitForAConfiguredEventAnd")}</td>
                  </tr>
                  <tr>
                    <td>{tr("docs.longRunningDocs.verificationLoop")}</td>
                    <td>{tr("docs.longRunningDocs.repeatTheSameBoundedWorkPlan")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="work-limits">
            <h2>{tr("docs.longRunningDocs.whenFreshJudgmentIsNeeded")}</h2>
            <p>{tr("docs.longRunningDocs.aDeterministicTaskCanWaitFor")}</p>
            <p>{tr("docs.longRunningDocs.experimentalSourceGoalAndHostedGoal")}</p>
          </section>

          <section id="work-recovery">
            <h2>{tr("docs.longRunningDocs.disconnectsDoNotEraseTheTask")}</h2>
            <p>{tr("docs.longRunningDocs.taskStateIsStoredSeparatelyFrom")}</p>
            <p>{tr("docs.longRunningDocs.keepAwakeCanHelpASupported")}</p>
          </section>

          <section id="work-security">
            <h2>{tr("docs.longRunningDocs.theTaskNeverExpandsDeviceAuthority")}</h2>
            <p>{tr("docs.longRunningDocs.everyExecutionStillChecksThePaired")}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
