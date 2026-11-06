import type { Translate } from "../../../locales/locale-catalog.js";
type ArcWhyProps = {
  tr: Translate;
  connectHref: string;
  arcHref: string;
};

export function ArcWhy({ tr, connectHref, arcHref }: ArcWhyProps) {
  const reasons = [
    {
      title: tr("marketing.arc.arcWhy.manageYourDeviceFleet"),
      detail: tr("marketing.arc.arcWhy.bringWindowsMacosAndLinuxInto"),
      status: tr("marketing.arc.arcWhy.connectAvailableToday"),
    },
    {
      title: tr("marketing.arc.arcWhy.setTheRulesOnEachMachine"),
      detail: tr("marketing.arc.arcWhy.chooseToolsAndFileWriteLocations"),
      status: tr("marketing.arc.arcWhy.connectAvailableToday"),
    },
    {
      title: tr("marketing.arc.arcWhy.buildAgentsAroundRepeatableWork"),
      detail: tr("marketing.arc.arcWhy.useArcSWorkspaceForConversations"),
      status: tr("marketing.arc.arcWhy.arcAvailableToday"),
    },
  ];
  const devices = [
    {
      brand: "windows",
      name: "Windows",
      task: tr("marketing.arc.arcWhy.runTheExistingTestSuite"),
      folder: "~/projects/release",
    },
    {
      brand: "macos",
      name: "macOS",
      task: tr("marketing.arc.arcWhy.checkTheBuildArtifacts"),
      folder: "~/work/release",
    },
    {
      brand: "linux",
      name: "Linux",
      task: tr("marketing.arc.arcWhy.collectTheServiceLogs"),
      folder: "~/services/app",
    },
  ];
  return (
    <section className="arcWhy" id="why-arc" aria-labelledby="arcWhyTitle">
      <header className="arcWhyIntro">
        <span className="arcV3Eyebrow">{tr("marketing.arc.arcWhy.whyArc")}</span>
        <h2 id="arcWhyTitle">{tr("marketing.arc.arcWhy.alreadyUseChatgptHereSWhere")}</h2>
        <p>{tr("marketing.arc.arcWhy.chatgptAlreadyConnectsAppsSuchAs")}</p>
        <strong className="arcWhyThesis">
          {tr("marketing.arc.arcWhy.yourMachinesYourWorkingRulesYour")}
        </strong>
      </header>
      <div className="arcWhyFocus">
        <ol className="arcWhyReasons">
          {reasons.map((reason, index) => (
            <li key={reason.title}>
              <span className="arcWhyReasonNumber">0{index + 1}</span>
              <div>
                <span className="arcWhyAvailability">{reason.status}</span>
                <h3>{reason.title}</h3>
                <p>{reason.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <figure className="arcWhyExample">
          <figcaption>
            <span>{tr("marketing.arc.arcWhy.oneReleaseYourOwnComputers")}</span>
            <small>{tr("marketing.arc.arcWhy.illustration")}</small>
          </figcaption>
          <div className="arcWhyRequest">
            <span className="arcWhyGithub">
              <img src="/app-brands/github.svg" alt="" width="23" height="23" />
            </span>
            <div>
              <span>{tr("marketing.arc.arcWhy.startWithTheReleaseIssue")}</span>
              <p>{tr("marketing.arc.arcWhy.runThisProjectSChecksOn")}</p>
            </div>
          </div>
          <div className="arcWhyDeviceList">
            {devices.map((device) => (
              <div className="arcWhyDevice" key={device.brand}>
                <span className="arcWhyPlatform">
                  <img
                    src={"/platform-brands/" + device.brand + ".svg"}
                    alt=""
                    width="25"
                    height="25"
                  />
                </span>
                <div>
                  <strong>{device.name}</strong>
                  <span>{device.task}</span>
                </div>
                <code>{device.folder}</code>
              </div>
            ))}
          </div>
          <div className="arcWhyResult">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" />
            </svg>
            <div>
              <strong>{tr("marketing.arc.arcWhy.oneReviewableReleaseReport")}</strong>
              <span>{tr("marketing.arc.arcWhy.checksLogsArtifactsAndTheNext")}</span>
            </div>
          </div>
          <p className="arcWhyExampleScope">
            {tr("marketing.arc.arcWhy.illustrativeWorkflowActualResultsDependOn")}
          </p>
        </figure>
      </div>
      <div className="arcWhyChoose">
        <h3>{tr("marketing.arc.arcWhy.chooseTheSetupThatFitsYour")}</h3>
        <div className="arcWhyOptions">
          <article className="arcWhyOption" aria-labelledby="arcWhyChatgpt">
            <span className="arcWhyOptionLabel">
              {tr("marketing.arc.arcWhy.keepYourExistingSetup")}
            </span>
            <h4 id="arcWhyChatgpt">ChatGPT</h4>
            <p>{tr("marketing.arc.arcWhy.yourExistingAppsToolsAndTasks")}</p>
            <a href="https://learn.chatgpt.com/docs/use-chatgpt" target="_blank" rel="noreferrer">
              {tr("marketing.arc.arcWhy.chatgptSCapabilities")} ↗
            </a>
          </article>
          <article className="arcWhyOption" aria-labelledby="arcWhyConnect">
            <span className="arcWhyOptionLabel">{tr("marketing.arc.arcWhy.availableToday")}</span>
            <h4 id="arcWhyConnect">Remote Arc Connect</h4>
            <p>{tr("marketing.arc.arcWhy.keepChatgptClaudeOrAnotherCompatible")}</p>
            <a href={connectHref}>{tr("marketing.arc.arcWhy.connectYourExistingAi")} ↗</a>
          </article>
          <article className="arcWhyOption" aria-labelledby="arcWhyHosted">
            <span className="arcWhyOptionLabel">{tr("marketing.arc.arcWhy.availableToday")}</span>
            <h4 id="arcWhyHosted">Arc</h4>
            <p>{tr("marketing.arc.arcWhy.aWorkspaceForConversationsSkillsTasks")}</p>
            <a href={arcHref}>{tr("marketing.arc.arcWhy.openArc")} ↗</a>
          </article>
        </div>
      </div>
      <p className="arcWhyContext">
        {tr("marketing.arc.arcWhy.theseProductsHaveOverlappingCapabilitiesArc")}{" "}
        <a
          href="https://learn.chatgpt.com/docs/dots/computers-and-apps"
          target="_blank"
          rel="noreferrer"
        >
          {tr("marketing.arc.arcWhy.openaiSCurrentComputerAndApp")} ↗
        </a>
      </p>
    </section>
  );
}
