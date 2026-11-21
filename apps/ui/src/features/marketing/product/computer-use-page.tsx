import { useI18n } from "../../../hooks/use-i18n.js";
import { dashboardHref } from "../../../config/app-config.js";
import { FeaturePage } from "./feature-page.js";
import "../../../styles/marketing/product/computer-use-page.css";

/** A desktop with the notice the person sees while AI uses the computer. */
function ComputerUsePicture() {
  const { tr } = useI18n();
  return (
    <div
      className="featureMock featureDesktopMock"
      aria-label={tr("marketing.computerUsePage.pictureLabel")}
    >
      <div className="featureDesktopNotice">
        <span aria-hidden="true">●</span> {tr("marketing.computerUsePage.notice")}
      </div>
      <div className="featureDesktopWindow">
        <header>
          <span aria-hidden="true">● ● ●</span>
          <strong>{tr("marketing.computerUsePage.mockApp")}</strong>
        </header>
        <div className="featureDesktopForm">
          <span>{tr("marketing.computerUsePage.mockField")}</span>
          <span className="featureDesktopInput">INV-2041</span>
          <span className="featureDesktopButton">
            {tr("marketing.computerUsePage.mockButton")}
            <span className="featureDesktopCursor" aria-hidden="true">
              ➤
            </span>
          </span>
        </div>
      </div>
      <span className="featureMockTool">✓ desktop_snapshot · ✓ desktop_act click</span>
    </div>
  );
}

/** The public page for computer use (desktop control). */
export function ComputerUsePage() {
  const { tr } = useI18n();
  return (
    <FeaturePage
      id="computer-use"
      eyebrow={tr("marketing.computerUsePage.eyebrow")}
      title={tr("marketing.computerUsePage.title")}
      lede={tr("marketing.computerUsePage.lede")}
      start={{
        label: tr("marketing.computerUsePage.start"),
        href: dashboardHref("/dashboard/connect/devices"),
      }}
      docs={{ label: tr("marketing.computerUsePage.docs"), href: "/docs/computer-use" }}
      visual={<ComputerUsePicture />}
      steps={[
        {
          title: tr("marketing.computerUsePage.stepOneTitle"),
          text: tr("marketing.computerUsePage.stepOneText"),
        },
        {
          title: tr("marketing.computerUsePage.stepTwoTitle"),
          text: tr("marketing.computerUsePage.stepTwoText"),
        },
        {
          title: tr("marketing.computerUsePage.stepThreeTitle"),
          text: tr("marketing.computerUsePage.stepThreeText"),
        },
      ]}
      plans={{
        title: tr("marketing.computerUsePage.plansTitle"),
        note: tr("marketing.computerUsePage.plansNote"),
        rows: [
          { plan: "free", text: tr("marketing.computerUsePage.plansFree") },
          { plan: "pro", text: tr("marketing.computerUsePage.plansPro") },
          { plan: "max", text: tr("marketing.computerUsePage.plansMax") },
        ],
      }}
      details={[
        {
          title: tr("marketing.computerUsePage.personWinsTitle"),
          text: tr("marketing.computerUsePage.personWinsText"),
        },
        {
          title: tr("marketing.computerUsePage.protectedTitle"),
          text: tr("marketing.computerUsePage.protectedText"),
        },
        {
          title: tr("marketing.computerUsePage.rightToolTitle"),
          text: tr("marketing.computerUsePage.rightToolText"),
        },
      ]}
      related={[
        { label: tr("marketing.computerUsePage.relatedDocs"), href: "/docs/computer-use" },
        { label: tr("marketing.computerUsePage.relatedBrowser"), href: "/chrome-extension" },
        { label: tr("marketing.computerUsePage.relatedPricing"), href: "/pricing" },
      ]}
    />
  );
}
