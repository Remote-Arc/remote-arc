import { useI18n } from "../../../hooks/use-i18n.js";
import "../../../styles/marketing/home/landing-demo-result.css";
export function DemoResultCard({ id }: { id: string }) {
  const { tr } = useI18n();
  const files: Record<string, { type: string; name: string; meta: string }> = {
    code: {
      type: "TS",
      name: "formatter.ts",
      meta: tr("marketing.home.landingDemoResult.fileChangedChecksPassed"),
    },
    release: {
      type: "DEPLOY",
      name: tr("marketing.home.landingDemoResult.releaseReview"),
      meta: tr("marketing.home.landingDemoResult.mergedPrsPreviewNeedsAttention"),
    },
    knowledge: {
      type: "DOC",
      name: tr("marketing.home.landingDemoResult.launchDecisionsNextSteps"),
      meta: tr("marketing.home.landingDemoResult.notionPageDriveSourceIncluded"),
    },
    slides: {
      type: "PPT",
      name: "review.pptx",
      meta: tr("marketing.home.landingDemoResult.slidesEditablePresentation"),
    },
    excel: {
      type: "XLS",
      name: "summary.xlsx",
      meta: tr("marketing.home.landingDemoResult.monthlySummaryTotalsReconciled"),
    },
    report: {
      type: "CSV",
      name: "export.csv",
      meta: tr("marketing.home.landingDemoResult.exportCompleteFileVerified"),
    },
    mail: {
      type: "MAIL",
      name: "Re: Launch",
      meta: tr("marketing.home.landingDemoResult.replyDraftNotSent"),
    },
    calendar: {
      type: "EVENT",
      name: tr("marketing.home.landingDemoResult.projectReview"),
      meta: tr("marketing.home.landingDemoResult.noConflicts"),
    },
    schedule: {
      type: "TASK",
      name: tr("marketing.home.landingDemoResult.serviceHealthCheck"),
      meta: tr("marketing.home.landingDemoResult.scheduledReadOnlyChecks"),
    },
    inspect: {
      type: "LOG",
      name: "service-diagnostics.log",
      meta: tr("marketing.home.landingDemoResult.connectionTimeoutsNoChangesMade"),
    },
  };
  const file = files[id];
  if (!file) return null;
  return (
    <details className="homeDemoResult" data-kind={file.type}>
      <summary aria-label={tr("marketing.home.landingDemoResult.previewResult") + file.name}>
        <span className="homeDemoResultType">{file.type}</span>
        <span className="homeDemoResultInfo">
          <span>{tr("marketing.home.landingDemoResult.exampleResult")}</span>
          <strong>{file.name}</strong>
          <small>{file.meta}</small>
        </span>
        <span className="homeDemoResultOpen">
          {tr("marketing.home.landingDemoResult.preview")} <span aria-hidden="true">↗</span>
        </span>
      </summary>
      <div className="homeDemoResultPreview">
        {id === "code" ? (
          <>
            <div className="homeDemoResultPreviewBar">
              <span>{tr("marketing.home.landingDemoResult.codeChanges")}</span>
              <span>+2 −1</span>
            </div>
            <pre className="homeDemoDiff">
              <span className="removed">- return value.toString();</span>
              {"\n"}
              <span className="added">+ if (value == null) return '';</span>
              {"\n"}
              <span className="added">+ return String(value);</span>
            </pre>
            <p className="homeDemoResultCheck">
              ✓ {tr("marketing.home.landingDemoResult.checksPassedLocalUndoAvailable")}
            </p>
          </>
        ) : id === "slides" ? (
          <div className="homeDemoSlidePreviews">
            {[
              tr("marketing.home.landingDemoResult.quarterlyReview"),
              tr("marketing.home.landingDemoResult.progressResults"),
              tr("marketing.home.landingDemoResult.whatComesNext"),
            ].map((title, index) => (
              <article key={title}>
                <span>0{index + 1}</span>
                <strong>{title}</strong>
                <i />
                <i />
                <small>REMOTE ARC · {tr("marketing.home.landingDemoResult.sample")}</small>
              </article>
            ))}
          </div>
        ) : id === "excel" || id === "report" ? (
          <div className="homeDemoResultSheet">
            <table>
              <thead>
                <tr>
                  <th>{tr("marketing.home.landingDemoResult.month")}</th>
                  <th>{tr("marketing.home.landingDemoResult.revenue")}</th>
                  <th>{tr("marketing.home.landingDemoResult.costs")}</th>
                  <th>{tr("marketing.home.landingDemoResult.net")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Apr</td>
                  <td>12,500</td>
                  <td>7,800</td>
                  <td>4,700</td>
                </tr>
                <tr>
                  <td>May</td>
                  <td>14,800</td>
                  <td>9,100</td>
                  <td>5,700</td>
                </tr>
                <tr>
                  <th>{tr("marketing.home.landingDemoResult.total")}</th>
                  <td>27,300</td>
                  <td>16,900</td>
                  <td>10,400</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : id === "release" ? (
          <div className="homeDemoReleaseRows">
            <div>
              <span>Production</span>
              <b>READY</b>
            </div>
            <div>
              <span>{tr("marketing.home.landingDemoResult.latestPreview")}</span>
              <b className="needsAttention">
                {tr("marketing.home.landingDemoResult.needsAttention")}
              </b>
            </div>
            <p>{tr("marketing.home.landingDemoResult.reviewTheFailingPreviewBeforeSharing")}</p>
          </div>
        ) : id === "knowledge" ? (
          <article className="homeDemoResultDocument">
            <small>DRIVE → NOTION</small>
            <h4>{tr("marketing.home.landingDemoResult.launchDecisions")}</h4>
            <p>{tr("marketing.home.landingDemoResult.shipTheApprovedReleaseAfterPreview")}</p>
            <h4>{tr("marketing.home.landingDemoResult.nextSteps")}</h4>
            <ol>
              <li>{tr("marketing.home.landingDemoResult.investigateTheFailingPreview")}</li>
              <li>{tr("marketing.home.landingDemoResult.reviewTheLaunchChecklist")}</li>
            </ol>
            <footer>{tr("marketing.home.landingDemoResult.sourceDriveLaunchBrief")}</footer>
          </article>
        ) : id === "mail" ? (
          <article className="homeDemoResultDocument">
            <small>{tr("marketing.home.landingDemoResult.emailDraftNotSent")}</small>
            <h4>Re: Launch</h4>
            <p>{tr("marketing.home.landingDemoResult.thanksForTheUpdateIVe")}</p>
            <p>{tr("marketing.home.landingDemoResult.pleaseConfirmThePreviewStatusAnd")}</p>
          </article>
        ) : id === "calendar" ? (
          <article className="homeDemoResultEvent">
            <span>10:00</span>
            <div>
              <strong>{tr("marketing.home.landingDemoResult.projectReview")}</strong>
              <p>10:00–10:30 · {tr("marketing.home.landingDemoResult.minutes")}</p>
              <small>{tr("marketing.home.landingDemoResult.bothCalendarsChecked")}</small>
            </div>
          </article>
        ) : id === "schedule" ? (
          <article className="homeDemoResultDocument">
            <small>{tr("marketing.home.landingDemoResult.scheduledTask")}</small>
            <h4>{tr("marketing.home.landingDemoResult.serviceHealthCheck")}</h4>
            <p>{tr("marketing.home.landingDemoResult.collectTheCurrentServiceStatusAnd")}</p>
            <footer>{tr("marketing.home.landingDemoResult.statusOnlyNoRestart")}</footer>
          </article>
        ) : (
          <pre className="homeDemoDiagnostic">
            {
              "10:02  connection timeout\n10:03  retry limit reached\n10:04  read-only inspection complete"
            }
          </pre>
        )}
        <span className="homeDemoResultDisclosure">
          {tr("marketing.home.landingDemoResult.samplePreviewFromThisGuidedDemo")}
        </span>
      </div>
    </details>
  );
}
