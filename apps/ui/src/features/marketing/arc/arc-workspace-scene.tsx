import { useI18n } from "../../../hooks/use-i18n.js";
import { useMarketingPlayback } from "../../../hooks/marketing/use-marketing-playback.js";
import "../../../styles/marketing/arc/arc-workspace-scene.css";

function SceneIcon({
  name,
}: {
  name: "message" | "check" | "document" | "pause" | "play" | "lock";
}) {
  const paths = {
    message: "M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5",
    check: "m5 12 4 4L19 6",
    document: "M6 3h8l4 4v14H6V3zm8 0v5h4M9 12h6m-6 4h6",
    pause: "M8 5v14m8-14v14",
    play: "m8 5 11 7-11 7V5z",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10zm7 4v3",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function ArcExecutionScene() {
  const { tr } = useI18n();
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(
    5,
    2600,
  );
  const labels = [
    tr("marketing.arc.arcWorkspaceScene.understandTheBrief"),
    tr("marketing.arc.arcWorkspaceScene.gatherTheContext"),
    tr("marketing.arc.arcWorkspaceScene.composeTheUpdate"),
    tr("marketing.arc.arcWorkspaceScene.checkEverySource"),
    tr("marketing.arc.arcWorkspaceScene.readyForYourReview"),
  ];
  const status = [
    tr("marketing.arc.arcWorkspaceScene.turningYourRequestIntoAPlan"),
    tr("marketing.arc.arcWorkspaceScene.readingTheSelectedProjectSources"),
    tr("marketing.arc.arcWorkspaceScene.bringingTheImportantChangesTogether"),
    tr("marketing.arc.arcWorkspaceScene.matchingTheDraftToItsSource"),
    tr("marketing.arc.arcWorkspaceScene.yourDraftIsReadyYouDecide"),
  ];
  const chooseStep = (index: number) => {
    setStep(index);
    setPlaying(false);
  };
  return (
    <div
      ref={ref}
      className="arcDesk"
      data-step={step}
      data-running={running}
      aria-label={tr("marketing.arc.arcWorkspaceScene.illustratedArcWorkspaceAWeeklyProject")}
    >
      <header className="arcDeskChrome">
        <div className="arcDeskIdentity">
          <img src="/remote-arc.svg" alt="" width="25" height="25" />
          <strong>arc</strong>
          <span>/</span>
          <span>{tr("marketing.arc.arcWorkspaceScene.projectStudio")}</span>
        </div>
        <span className="arcDeskConcept">
          {tr("marketing.arc.arcWorkspaceScene.productDemoExampleData")}
        </span>
        <button
          className="arcV3ScenePlayback"
          type="button"
          disabled={reducedMotion}
          onClick={() => setPlaying((value) => !value)}
          aria-label={
            playing
              ? tr("marketing.arc.arcWorkspaceScene.pauseDemoAnimation")
              : tr("marketing.arc.arcWorkspaceScene.playDemoAnimation")
          }
        >
          <SceneIcon name={playing ? "pause" : "play"} />
          {reducedMotion
            ? tr("marketing.arc.arcWorkspaceScene.manualPreview")
            : playing
              ? tr("marketing.arc.arcWorkspaceScene.pause")
              : tr("marketing.arc.arcWorkspaceScene.play")}
        </button>
      </header>
      <div className="arcDeskBrief">
        <span className="arcDeskAvatar">Y</span>
        <div>
          <span>{tr("marketing.arc.arcWorkspaceScene.youSetTheDirection")}</span>
          <strong>{tr("marketing.arc.arcWorkspaceScene.prepareMyWeeklyProjectUpdate")}</strong>
          <p>{tr("marketing.arc.arcWorkspaceScene.checkMergedGithubPrsAndVercel")}</p>
        </div>
        <SceneIcon name="message" />
      </div>
      <div className="arcDeskBody">
        <aside
          className="arcDeskTimeline"
          aria-label={tr("marketing.arc.arcWorkspaceScene.exploreTheExampleSteps")}
        >
          <span className="arcDeskOverline">{tr("marketing.arc.arcWorkspaceScene.theWork")}</span>
          {labels.map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? "current" : index < step ? "complete" : ""}
              aria-pressed={index === step}
              onClick={() => chooseStep(index)}
            >
              <span>{index < step ? <SceneIcon name="check" /> : "0" + (index + 1)}</span>
              <strong>{label}</strong>
            </button>
          ))}
          <div className="arcDeskScope">
            <SceneIcon name="lock" />
            <span>
              {tr("marketing.arc.arcWorkspaceScene.selectedSourcesOnlyNothingSharedAutomatically")}
            </span>
          </div>
        </aside>
        <div className="arcDeskWorkspace">
          <div className="arcDeskSources">
            <div className="arcDeskSectionLabel">
              <span>{tr("marketing.arc.arcWorkspaceScene.projectContext")}</span>
              <small>{step === 0 ? "0 / 2" : "2 / 2"}</small>
            </div>
            <article className="arcDeskSource" data-ready={step >= 1}>
              <div className="arcDeskSourceHead">
                <span className="arcDeskBrand" data-brand="github">
                  <img src="/app-brands/github.svg" alt="" width="24" height="24" />
                </span>
                <div>
                  <strong>GitHub</strong>
                  <small>{tr("marketing.arc.arcWorkspaceScene.mergedPullRequests")}</small>
                </div>
                <span className="arcDeskSourceState">
                  {step >= 1 ? <SceneIcon name="check" /> : "01"}
                </span>
              </div>
              <div className="arcDeskSourceContent">
                {step >= 1 ? (
                  <>
                    <span className="arcDeskSourceTag">
                      {tr("marketing.arc.arcWorkspaceScene.merged")}
                    </span>
                    <p>{tr("marketing.arc.arcWorkspaceScene.improveDeviceReconnection")}</p>
                    <small>{tr("marketing.arc.arcWorkspaceScene.sourceExampleProject")}</small>
                  </>
                ) : (
                  <>
                    <i />
                    <i />
                    <small>{tr("marketing.arc.arcWorkspaceScene.waitingForTheBrief")}</small>
                  </>
                )}
              </div>
            </article>
            <article className="arcDeskSource" data-ready={step >= 1}>
              <div className="arcDeskSourceHead">
                <span className="arcDeskBrand" data-brand="vercel">
                  <img src="/app-brands/vercel.svg" alt="" width="24" height="24" />
                </span>
                <div>
                  <strong>Vercel</strong>
                  <small>{tr("marketing.arc.arcWorkspaceScene.deploymentStatus")}</small>
                </div>
                <span className="arcDeskSourceState">
                  {step >= 1 ? <SceneIcon name="check" /> : "02"}
                </span>
              </div>
              <div className="arcDeskSourceContent">
                {step >= 1 ? (
                  <>
                    <span className="arcDeskSourceTag arcDeskSourceTag--notes">
                      {tr("marketing.arc.arcWorkspaceScene.previewError")}
                    </span>
                    <p>{tr("marketing.arc.arcWorkspaceScene.onePreviewNeedsInvestigation")}</p>
                    <small>{tr("marketing.arc.arcWorkspaceScene.sourceExampleProject2")}</small>
                  </>
                ) : (
                  <>
                    <i />
                    <i />
                    <small>{tr("marketing.arc.arcWorkspaceScene.selectedForThisTask")}</small>
                  </>
                )}
              </div>
            </article>
            <div className="arcDeskConductor">
              <span className="arcDeskConductorMark">
                <img src="/remote-arc.svg" alt="" width="25" height="25" />
              </span>
              <div>
                <strong>
                  {step === 4
                    ? tr("marketing.arc.arcWorkspaceScene.workBroughtTogether")
                    : tr("marketing.arc.arcWorkspaceScene.arcIsConnectingTheDots")}
                </strong>
                <span>{tr("marketing.arc.arcWorkspaceScene.contextDraftSourceCheck")}</span>
              </div>
              <span className="arcDeskSignal" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
          <div className="arcDeskTransfer" aria-hidden="true">
            <i />
            <i />
          </div>
          <article className="arcDeskDocument" data-ready={step >= 2}>
            <div className="arcDeskDocumentChrome">
              <SceneIcon name="document" />
              <span>weekly-update.md</span>
              <small>
                {step >= 4
                  ? tr("marketing.arc.arcWorkspaceScene.forReview")
                  : tr("marketing.arc.arcWorkspaceScene.draft")}
              </small>
            </div>
            <div className="arcDeskPaper">
              <span className="arcDeskOverline">
                {tr("marketing.arc.arcWorkspaceScene.yourNextDeliverable")}
              </span>
              <h3>{tr("marketing.arc.arcWorkspaceScene.thisWeekInFocus")}</h3>
              <p className="arcDeskDocumentSub">
                {tr("marketing.arc.arcWorkspaceScene.aProjectUpdateWithATrail")}
              </p>
              <div className="arcDeskDraftSection" aria-hidden={step < 2} data-revealed={step >= 2}>
                <span>{tr("marketing.arc.arcWorkspaceScene.shipped")}</span>
                <h4>{tr("marketing.arc.arcWorkspaceScene.aSmootherReturnToWork")}</h4>
                <p>
                  {tr("marketing.arc.arcWorkspaceScene.deviceReconnectionWasImprovedInThe")}
                  <sup className={step >= 3 ? "verified" : ""}>01</sup>
                </p>
              </div>
              <div className="arcDeskDraftSection" aria-hidden={step < 2} data-revealed={step >= 2}>
                <span>{tr("marketing.arc.arcWorkspaceScene.upNext")}</span>
                <h4>{tr("marketing.arc.arcWorkspaceScene.investigateTheFailingPreview")}</h4>
                <p>
                  {tr("marketing.arc.arcWorkspaceScene.theVercelDeploymentStatusFlagsOne")}
                  <sup className={step >= 3 ? "verified" : ""}>02</sup>
                </p>
              </div>
              <div className="arcDeskDocumentEmpty" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <footer className="arcDeskDocumentFooter" data-ready={step >= 4}>
              <span className="arcDeskReviewDot" />
              <strong>
                {step >= 4
                  ? tr("marketing.arc.arcWorkspaceScene.draftReadyForReview")
                  : step >= 3
                    ? tr("marketing.arc.arcWorkspaceScene.sourceReferencesChecked")
                    : step === 2
                      ? tr("marketing.arc.arcWorkspaceScene.draftInProgress")
                      : tr("marketing.arc.arcWorkspaceScene.theDraftWillAppearHere")}
              </strong>
              <span>
                {step >= 4
                  ? tr("marketing.arc.arcWorkspaceScene.notSent")
                  : step >= 3
                    ? "2 / 2"
                    : "—"}
              </span>
            </footer>
          </article>
        </div>
      </div>
      <footer className="arcDeskFooter">
        <span className="arcDeskActivityDot" />
        <span key={step} className="arcDeskActivityText">
          {status[step]}
        </span>
        <span className="arcDeskCounter">0{step + 1} / 05</span>
      </footer>
      <p className="arcDeskDisclosure">
        {tr("marketing.arc.arcWorkspaceScene.sampleContentThisArcWorkspaceIs")}
      </p>
    </div>
  );
}
