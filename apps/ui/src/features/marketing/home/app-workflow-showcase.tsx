import { useEffect, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { useMarketingPlayback } from "../../../hooks/marketing/use-marketing-playback.js";
import { APP_WORKFLOW_EXAMPLES } from "./app-workflow-examples.js";
import "../../../styles/marketing/home/app-workflow-showcase.css";
export function AppWorkflowShowcase() {
  const { tr, locale } = useI18n(),
    [selected, setSelected] = useState(0),
    example = APP_WORKFLOW_EXAMPLES[selected]!;
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(
    example.traces.length,
    2400,
  );
  useEffect(() => {
    setStep(0);
  }, [selected, setStep]);
  return (
    <section
      className="appWorkflowShowcase"
      id="arc-workflows"
      ref={ref}
      data-running={running}
      aria-labelledby="appWorkflowsTitle"
    >
      <header className="modernSectionIntro">
        <span className="eyebrow">
          {tr("marketing.home.appWorkflowShowcase.oneRequestAcrossYourToolstack")}
        </span>
        <h2 id="appWorkflowsTitle">
          {tr("marketing.home.appWorkflowShowcase.realWorkRarelyStaysInOne")}
        </h2>
        <p>{tr("marketing.home.appWorkflowShowcase.letYourAiConnectTheContext")}</p>
      </header>
      <div
        className="appWorkflowTabs"
        role="group"
        aria-label={tr("marketing.home.appWorkflowShowcase.exampleWorkflows")}
      >
        {APP_WORKFLOW_EXAMPLES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {tr(item.label)}
          </button>
        ))}
      </div>
      <article className="appWorkflowPanel" data-workflow={example.id}>
        <div className="appWorkflowStory">
          <span className="appWorkflowNumber">0{selected + 1}</span>
          <h3>{tr(example.title)}</h3>
          <blockquote>{tr(example.request)}</blockquote>
          <p>{tr(example.result)}</p>
          <span className="appWorkflowPermissions">{tr(example.permission)}</span>
          <a
            href={localizedWebsiteHref(
              "/integrations?provider=" + example.connectionProvider,
              locale,
            )}
          >
            {tr("marketing.home.appWorkflowShowcase.exploreTheseConnections")} ↗
          </a>
        </div>
        <div className="appWorkflowAction">
          <div className="appWorkflowMap">
            <span className="appWorkflowArc">
              <img src="/remote-arc.svg" alt="Remote Arc" width="48" height="48" />
            </span>
            <span className="appWorkflowLink" aria-hidden="true" />
            <div className="appWorkflowBrands">
              {example.brands.map((brand) => (
                <span key={brand.brand}>
                  <i data-brand={brand.brand}>
                    <img
                      src={"/app-brands/" + brand.brand + ".svg"}
                      alt=""
                      width="30"
                      height="30"
                    />
                  </i>
                  <strong>{brand.name}</strong>
                </span>
              ))}
            </div>
          </div>
          <ol className="appWorkflowSteps">
            {example.traces.map((trace, index) => (
              <li key={index} data-active={index === step} data-complete={index < step}>
                <button
                  type="button"
                  onClick={() => {
                    setStep(index);
                    setPlaying(false);
                  }}
                  aria-current={index === step ? "step" : undefined}
                >
                  <span>{index < step ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{tr(trace.working).replace(/…$/, "")}</strong>
                    <small>{tr(trace.output)}</small>
                  </div>
                </button>
              </li>
            ))}
          </ol>
          <footer>
            <span>
              {tr("marketing.home.appWorkflowShowcase.simulatedWorkflowConnectedAccounts")}
            </span>
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              disabled={reducedMotion}
              aria-label={
                playing
                  ? tr("marketing.home.appWorkflowShowcase.pauseWorkflowAnimation")
                  : tr("marketing.home.appWorkflowShowcase.playWorkflowAnimation")
              }
            >
              {reducedMotion
                ? tr("marketing.home.appWorkflowShowcase.manualPreview")
                : playing
                  ? tr("marketing.home.appWorkflowShowcase.pause")
                  : tr("marketing.home.appWorkflowShowcase.play")}
            </button>
          </footer>
          {example.id === "video" && (
            <a
              className="appWorkflowRunway"
              href="https://runwayml.com"
              target="_blank"
              rel="noreferrer"
            >
              Powered by Runway ↗
            </a>
          )}
        </div>
      </article>
      <p className="appWorkflowDisclosure">
        {tr("marketing.home.appWorkflowShowcase.illustrativeExamplesThisDemoDoesNot")}
      </p>
    </section>
  );
}
