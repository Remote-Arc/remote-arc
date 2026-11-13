import React, { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/install/client-install-walkthrough.css";

type Client = "claude" | "gemini";
type StepKind =
  | "add"
  | "auth"
  | "connect"
  | "tools"
  | "approval"
  | "running"
  | "result"
  | "gemini-url"
  | "gemini-auth"
  | "gemini-connect"
  | "gemini-use"
  | "gemini-ready";

const filenames: Record<StepKind, string> = {
  add: "01-add-custom-connector.png",
  auth: "02-oauth-settings.png",
  connect: "03-connect.png",
  tools: "04-tool-permissions.png",
  approval: "05-tool-approval.png",
  running: "06-scan-progress.png",
  result: "07-readonly-scan-result.png",
  "gemini-url": "step-01.png",
  "gemini-auth": "step-02.png",
  "gemini-connect": "step-03.png",
  "gemini-use": "step-04.png",
  "gemini-ready": "step-05.png",
};

function GuideScreenshot({ client, src, alt }: { client: Client; src: string; alt: string }) {
  return (
    <div className={"claudeGuideImageArea claudeGuideImageArea--" + client}>
      <img src={src} alt={alt} decoding="async" />
    </div>
  );
}

export function ClientInstallWalkthrough({ client }: { client: Client }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setSelected(0);
    setExpanded(false);
  }, [client]);
  useEffect(() => {
    if (!expanded) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [expanded]);
  const claudeSteps: {
    kind: StepKind;
    group: string;
    title: string;
    detail: string;
    note: string;
  }[] = [
    {
      kind: "add",
      group: tr("install.clientInstallWalkthrough.setUp"),
      title: tr("install.clientInstallWalkthrough.addACustomConnector"),
      detail: tr("install.clientInstallWalkthrough.inClaudeOpenCustomizeConnectorsClick"),
      note: tr("install.clientInstallWalkthrough.theUrlMustEndInMcp"),
    },
    {
      kind: "auth",
      group: tr("install.clientInstallWalkthrough.setUp"),
      title: tr("install.clientInstallWalkthrough.chooseOauthSignIn"),
      detail: tr("install.clientInstallWalkthrough.selectSignInNowUnderAuthentication"),
      note: tr("install.clientInstallWalkthrough.doNotChooseNoSignIn"),
    },
    {
      kind: "connect",
      group: tr("install.clientInstallWalkthrough.setUp"),
      title: tr("install.clientInstallWalkthrough.connectYourRemoteArcAccount"),
      detail: tr("install.clientInstallWalkthrough.openTheNewRemoteArcConnector"),
      note: tr("install.clientInstallWalkthrough.connectingTheAccountDoesNotPair"),
    },
    {
      kind: "tools",
      group: tr("install.clientInstallWalkthrough.permissions"),
      title: tr("install.clientInstallWalkthrough.reviewToolPermissions"),
      detail: tr("install.clientInstallWalkthrough.afterConnectionClaudeShowsTheRemote"),
      note: tr("install.clientInstallWalkthrough.claudeSToolPermissionsDoNot"),
    },
    {
      kind: "approval",
      group: tr("install.clientInstallWalkthrough.tryIt"),
      title: tr("install.clientInstallWalkthrough.approveTheFirstToolCall"),
      detail: tr("install.clientInstallWalkthrough.enableRemoteArcFromTheChat"),
      note: tr("install.clientInstallWalkthrough.forASaferFirstTestStart"),
    },
    {
      kind: "running",
      group: tr("install.clientInstallWalkthrough.tryIt"),
      title: tr("install.clientInstallWalkthrough.letClaudeWorkOnYourComputer"),
      detail: tr("install.clientInstallWalkthrough.forExampleAskClaudeWhyYour"),
      note: tr("install.clientInstallWalkthrough.diskScansCanTakeAWhile"),
    },
    {
      kind: "result",
      group: tr("install.clientInstallWalkthrough.tryIt"),
      title: tr("install.clientInstallWalkthrough.reviewTheResults"),
      detail: tr("install.clientInstallWalkthrough.claudeReturnsAFolderByFolder"),
      note: tr("install.clientInstallWalkthrough.theExampleNumbersAreIllustrativeNot"),
    },
  ];
  const geminiSteps: {
    kind: StepKind;
    group: string;
    title: string;
    detail: string;
    note: string;
  }[] = [
    {
      kind: "gemini-url",
      group: tr("install.clientInstallWalkthrough.connect"),
      title: tr("install.clientInstallWalkthrough.addTheRemoteArcMcpUrl"),
      detail: tr("install.clientInstallWalkthrough.inGeminiOnTheWebOpen"),
      note: tr("install.clientInstallWalkthrough.enterTheCompleteHttpsUrlIncluding"),
    },
    {
      kind: "gemini-auth",
      group: tr("install.clientInstallWalkthrough.authorize"),
      title: tr("install.clientInstallWalkthrough.reviewGoogleAccountLinking"),
      detail: tr("install.clientInstallWalkthrough.googleDisplaysTheAccountLinkingPermission"),
      note: tr("install.clientInstallWalkthrough.onlyAuthorizeAConnectorYouTrust"),
    },
    {
      kind: "gemini-connect",
      group: tr("install.clientInstallWalkthrough.connect2"),
      title: tr("install.clientInstallWalkthrough.nameAndConnectTheCustomApp"),
      detail: tr("install.clientInstallWalkthrough.afterLinkingNameTheCustomApp"),
      note: tr("install.clientInstallWalkthrough.visibleActionsReflectTheMcpServer"),
    },
    {
      kind: "gemini-use",
      group: tr("install.clientInstallWalkthrough.start"),
      title: tr("install.clientInstallWalkthrough.selectRemoteArcWith"),
      detail: tr("install.clientInstallWalkthrough.inAGeminiChatEnterAnd"),
      note: tr("install.clientInstallWalkthrough.keepYourComputerOnlineWithNpx"),
    },
    {
      kind: "gemini-ready",
      group: tr("install.clientInstallWalkthrough.tryIt2"),
      title: tr("install.clientInstallWalkthrough.tryAReadOnlyTaskIn"),
      detail: tr("install.clientInstallWalkthrough.askGeminiToListYourPaired"),
      note: tr("install.clientInstallWalkthrough.aConnectedAppStillNeedsAn"),
    },
  ];
  const steps = client === "claude" ? claudeSteps : geminiSteps;
  const count = steps.length;
  const step = steps[selected]!;
  const src =
    "/" + (client === "claude" ? "claude-setup/" : "guides/gemini/") + filenames[step.kind];
  const move = (next: number) => setSelected(Math.max(0, Math.min(count - 1, next)));
  const clientName = client === "claude" ? "Claude" : "Gemini";

  return (
    <div className="claudeWalkthrough">
      <div className="claudeGuideIntro">
        <div>
          <span className="eyebrow">
            {tr("install.clientInstallWalkthrough.realScreenshotWalkthrough")}
          </span>
          <h3>{tr("install.clientInstallWalkthrough.setUpRemoteArcIn", { clientName })}</h3>
          <p>{tr("install.clientInstallWalkthrough.stepByStepWithOriginalScreenshots")}</p>
        </div>
        <span className="claudeGuideCount" aria-live="polite">
          {String(selected + 1).padStart(2, "0")} <span>/ {String(count).padStart(2, "0")}</span>
        </span>
      </div>
      <div className="claudeGuideLayout">
        <nav
          className="claudeGuideNav"
          aria-label={tr("install.clientInstallWalkthrough.installationSteps", { clientName })}
        >
          {steps.map((item, index) => (
            <button
              type="button"
              key={item.kind}
              className={selected === index ? "claudeGuideStep active" : "claudeGuideStep"}
              aria-current={selected === index ? "step" : undefined}
              onClick={() => move(index)}
            >
              <span className="claudeGuideStepNum">{String(index + 1).padStart(2, "0")}</span>
              <span className="claudeGuideStepText">
                <small>{item.group}</small>
                <strong>{item.title}</strong>
              </span>
            </button>
          ))}
        </nav>
        <div className="claudeGuideMain">
          <div className="claudeGuideText">
            <span>
              {tr("install.clientInstallWalkthrough.step")} {String(selected + 1).padStart(2, "0")}
            </span>
            <h4>{step.title}</h4>
            <p>{step.detail}</p>
          </div>
          <button
            className="claudeGuidePreview"
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={tr("install.clientInstallWalkthrough.enlargeTheOriginalScreenshot")}
          >
            <GuideScreenshot client={client} src={src} alt={step.title} />
            <span className="claudeGuidePreviewCaption">
              ↗ {tr("install.clientInstallWalkthrough.clickToEnlargeScreenshot")}
            </span>
          </button>
          <p className="claudeGuideHint">
            <span aria-hidden="true">ⓘ</span>
            {step.note}
          </p>
          <div className="claudeGuideControls">
            <button type="button" onClick={() => move(selected - 1)} disabled={selected === 0}>
              ← {tr("install.clientInstallWalkthrough.previous")}
            </button>
            <span className="claudeGuideProgress" aria-hidden="true">
              <i style={{ width: ((selected + 1) / count) * 100 + "%" }} />
            </span>
            <button
              type="button"
              onClick={() => move(selected + 1)}
              disabled={selected === count - 1}
            >
              {tr("install.clientInstallWalkthrough.nextStep")} →
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="claudeGuideOverlay" onClick={() => setExpanded(false)}>
          <div
            className="claudeGuideModal"
            role="dialog"
            aria-modal="true"
            aria-label={step.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="claudeGuideModalHeader">
              <strong>
                {String(selected + 1).padStart(2, "0")} · {step.title}
              </strong>
              <div className="claudeGuideModalActions">
                <a href={src} target="_blank" rel="noopener noreferrer">
                  {tr("install.clientInstallWalkthrough.openOriginal")}
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label={tr("install.clientInstallWalkthrough.close")}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="claudeGuideModalContent">
              <GuideScreenshot client={client} src={src} alt={step.title} />
            </div>
            <p>{step.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
