import { useId, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { arcChatHref } from "../../../../../../packages/docs/src/arc-use-cases.js";
import {
  VideoEditingPreview,
  DeviceFleetPreview,
  PerformancePreview,
  WorkspacePreview,
} from "../arc/arc-connected-previews.js";
import { BrowserPreview } from "../arc/connected-browser-preview.js";
import { DesktopControlPreview } from "../arc/connected-desktop-preview.js";
import { HomeThreeSteps } from "../home/home-three-steps.js";
import { SectionTitle } from "../home/section-title.js";
import "../../../styles/marketing/use-cases/agent-use-cases.css";

export function AgentUseCases() {
  const { tr, locale } = useI18n();
  const [selected, setSelected] = useState(0);
  const uid = useId();
  const cases = [
    {
      id: "fleet",
      icon: "device",
      name: tr("marketing.useCases.agentUseCases.deviceFleet"),
      title: tr("marketing.useCases.agentUseCases.yourWholeFleetOneConversation"),
      detail: tr("marketing.useCases.agentUseCases.seeWhichComputersAreOnlineChoose"),
      prompt: tr("marketing.useCases.agentUseCases.showMyConnectedDevicesAndTheir"),
      note: tr("marketing.useCases.agentUseCases.oneViewAcrossYourConnectedComputers"),
      brands: ["macos", "windows", "linux"],
    },
    {
      id: "performance",
      icon: "activity",
      name: tr("marketing.useCases.agentUseCases.performance"),
      title: tr("marketing.useCases.agentUseCases.knowWhatYourDevicesCanHandle"),
      detail: tr("marketing.useCases.agentUseCases.askAboutCpuMemoryAndDisk"),
      prompt: tr("marketing.useCases.agentUseCases.checkCpuMemoryAndFreeDisk"),
      note: tr("marketing.useCases.agentUseCases.deviceSnapshotsExplainedInPlainLanguage"),
      brands: ["windows"],
    },
    {
      id: "workspaces",
      icon: "panel",
      name: tr("marketing.useCases.agentUseCases.workspaces"),
      title: tr("marketing.useCases.agentUseCases.pickAProjectLetArcDo"),
      detail: tr("marketing.useCases.agentUseCases.chooseAProjectFolderAndA"),
      prompt: tr("marketing.useCases.agentUseCases.helpMeWorkInAProject"),
      note: tr("marketing.useCases.agentUseCases.yourFilesAndProjectContextStay"),
      brands: ["macos", "linux"],
    },
    {
      id: "browser",
      icon: "link",
      name: tr("marketing.useCases.agentUseCases.browser"),
      title: tr("marketing.useCases.agentUseCases.browserTitle"),
      detail: tr("marketing.useCases.agentUseCases.browserDetail"),
      prompt: tr("marketing.useCases.agentUseCases.browserPrompt"),
      note: tr("marketing.useCases.agentUseCases.browserNote"),
      brands: ["browser"],
    },
    {
      id: "desktop",
      icon: "device",
      name: tr("marketing.useCases.agentUseCases.computerUse"),
      title: tr("marketing.useCases.agentUseCases.computerUseTitle"),
      detail: tr("marketing.useCases.agentUseCases.computerUseDetail"),
      prompt: tr("marketing.useCases.agentUseCases.computerUsePrompt"),
      note: tr("marketing.useCases.agentUseCases.computerUseNote"),
      brands: ["windows", "linux"],
    },
    {
      id: "video",
      icon: "panel",
      name: tr("marketing.useCases.agentUseCases.videoEditing"),
      title: tr("marketing.useCases.agentUseCases.yourClipsAStoryWorthSharing"),
      detail: tr("marketing.useCases.agentUseCases.trimFootageCombineClipsAndAdd"),
      prompt: tr("marketing.useCases.agentUseCases.editTheClipsInMyProject"),
      note: tr("marketing.useCases.agentUseCases.localVideoWorkflowYourFootageStays"),
      brands: ["macos", "windows"],
    },
  ] as const;
  const current = cases[selected]!;
  return (
    <section
      className="agentUseCases sectionBlock"
      id="agent-use-cases"
      aria-labelledby={uid + "-heading"}
    >
      {/* Editorial intro: the headline large on the left, the eyebrow and copy beside it. */}
      <header className="modernSectionIntro modernSectionIntro--split">
        <SectionTitle
          id={uid + "-heading"}
          text={tr("marketing.useCases.agentUseCases.aNewWayToUseYour")}
        />
        <div>
          <span className="eyebrow">{tr("marketing.useCases.agentUseCases.aNewWayToWork")}</span>
          <p>{tr("marketing.useCases.agentUseCases.forYearsUsingAComputerHas")}</p>
        </div>
      </header>
      <HomeThreeSteps />
      <div className="agentConnectedToolbar">
        <div
          className="agentConnectedTabs"
          role="tablist"
          aria-label={tr("marketing.useCases.agentUseCases.exploreConnectedCapabilities")}
        >
          {cases.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={uid + "-" + item.id}
              aria-controls={uid + "-panel"}
              aria-selected={selected === index}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? cases.length - 1
                      : (selected + (event.key === "ArrowRight" ? 1 : -1) + cases.length) %
                        cases.length;
                setSelected(next);
                document.getElementById(uid + "-" + cases[next]!.id)?.focus();
              }}
            >
              <Icon name={item.icon} size={15} />
              {item.name}
            </button>
          ))}
        </div>
        <span className="agentConnectedProducts">
          <span>
            <img src="/remote-arc.svg" alt="" width={14} height={14} />
            Arc
          </span>
          <i>·</i>
          <span>{tr("marketing.useCases.agentUseCases.builtWithConnect")}</span>
        </span>
      </div>
      <div
        className="agentConnectedPanel"
        role="tabpanel"
        id={uid + "-panel"}
        aria-labelledby={uid + "-" + current.id}
        data-workflow={current.id}
        tabIndex={0}
      >
        <div className="agentConnectedCopy">
          <div className="agentConnectedLogos">
            {current.brands.map((brand) => (
              <a
                key={brand}
                href={localizedWebsiteHref(
                  brand === "browser" ? "/chrome-extension" : "/downloads",
                  locale,
                )}
                aria-label={tr("marketing.useCases.agentUseCases.connect") + brand}
              >
                <img
                  src={"/platform-brands/" + brand + ".svg"}
                  alt={
                    brand === "macos"
                      ? "Mac"
                      : brand === "windows"
                        ? "Windows"
                        : brand === "browser"
                          ? "Chrome"
                          : "Linux"
                  }
                  width={24}
                  height={24}
                />
              </a>
            ))}
          </div>
          <h3>{current.title}</h3>
          <p>{current.detail}</p>
          <div className="agentConnectedRequest">
            <Icon name="chat" size={15} />
            <span>“{current.prompt}”</span>
          </div>
          {/* Computer use runs from your own AI client, not Arc, so it links to its guide. */}
          {current.id === "desktop" ? (
            <a
              className="agentConnectedAction"
              href={localizedWebsiteHref("/docs/computer-use", locale)}
            >
              {tr("marketing.useCases.agentUseCases.howComputerUseWorks")}
              <Icon name="arrowUpRight" size={15} />
            </a>
          ) : (
            <a
              className="agentConnectedAction"
              href={arcChatHref(current.prompt, "homepage-connected:" + current.id)}
            >
              {tr("marketing.useCases.agentUseCases.tryItInArc")}
              <Icon name="arrowUpRight" size={15} />
            </a>
          )}
        </div>
        <div className="agentConnectedVisual">
          <header>
            <span>
              <img src="/remote-arc.svg" alt="" width={18} height={18} />
              {(current.id === "desktop" ? "Connect / " : "Arc / ") + current.name}
            </span>
            <small>{tr("marketing.useCases.agentUseCases.exampleWorkspace")}</small>
          </header>
          <div className="agentConnectedCanvas" key={current.id}>
            {current.id === "fleet" ? (
              <DeviceFleetPreview />
            ) : current.id === "performance" ? (
              <PerformancePreview />
            ) : current.id === "workspaces" ? (
              <WorkspacePreview />
            ) : current.id === "browser" ? (
              <BrowserPreview />
            ) : current.id === "desktop" ? (
              <DesktopControlPreview />
            ) : (
              <VideoEditingPreview />
            )}
          </div>
          <footer>
            <Icon name="check" size={13} />
            <span>{current.note}</span>
            <small>{tr("marketing.useCases.agentUseCases.exampleData")}</small>
          </footer>
        </div>
      </div>
    </section>
  );
}
