import { INTENT_ESSAY } from "../../../../../packages/docs/src/intent-driven-essay.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { type User } from "../../types/app-types.js";
import { PublicLayout } from "../../components/public-layout.js";

const blogPosts = [
  {
    slug: "why-i-built-remote-arc",
    date: "27 Sep 2026",
    readTime: "6 min read",
    author: "Sam Yao",
  },
  {
    slug: "remote-arc-vs-openclaw",
    date: "27 Sep 2026",
    readTime: "8 min read",
    author: "Sam Yao",
  },
  {
    slug: "powerful-ai-access-without-exposing-your-computer",
    date: "27 Sep 2026",
    readTime: "7 min read",
    author: "Sam Yao",
  },
  {
    slug: "how-remote-arc-works",
    date: "27 Sep 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
  {
    slug: "go-vs-typescript-agent-benchmarks",
    date: "9 Oct 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
] as const;
export function BlogsPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const posts = [
    {
      slug: INTENT_ESSAY.slug,
      date: INTENT_ESSAY.date,
      readTime: "7 min read",
      author: "Sam Yao",
      title: tr(INTENT_ESSAY.title.en, INTENT_ESSAY.title.zh),
      summary: tr(INTENT_ESSAY.deck.en, INTENT_ESSAY.deck.zh),
      tag: tr("blog.blogPages.personalNotes"),
    },
    {
      ...blogPosts[4],
      title: tr("blog.blogPages.whyRemoteArcChoseGoMeasured"),
      summary: tr("blog.blogPages.anHonestAccountOfAWindows"),
      tag: tr("blog.blogPages.engineeringBenchmark"),
    },
    {
      ...blogPosts[0],
      title: tr("blog.blogPages.whyIBuiltRemoteArcAi"),
      summary: tr("blog.blogPages.chatIsUsefulAgentsAreMore"),
      tag: tr("blog.blogPages.whyRemoteArc"),
    },
    {
      ...blogPosts[1],
      title: tr("blog.blogPages.remoteArcVsOpenclawTwoDifferent"),
      summary: tr("blog.blogPages.bothCanHelpAiActOn"),
      tag: tr("blog.blogPages.comparison"),
    },
    {
      ...blogPosts[2],
      title: tr("blog.blogPages.howRemoteArcKeepsAiAccess"),
      summary: tr("blog.blogPages.powerfulRemoteAccessShouldNotRequire"),
      tag: tr("blog.blogPages.security"),
    },
    {
      ...blogPosts[3],
      title: tr("blog.blogPages.howRemoteArcWorksWorkerDurable"),
      summary: tr("blog.blogPages.aRequestBeginsInAnAi"),
      tag: tr("blog.blogPages.architecture"),
    },
  ];

  return (
    <PublicLayout user={user}>
      <section className="readingPageIntro blogReadingIntro">
        <div>
          <span className="eyebrow">{tr("blog.blogPages.blog")}</span>
          <h1>{tr("blog.blogPages.remoteArcBlog")}</h1>
        </div>
        <p>{tr("blog.blogPages.engineeringNotesArchitectureDecisionsSecurityTrade")}</p>
        <nav className="readingPageLinks" aria-label={tr("blog.blogPages.exploreRelatedResources")}>
          <a href={localizedWebsiteHref("/docs", locale)}>{tr("blog.blogPages.docs")} →</a>
          <a href={localizedWebsiteHref("/security-model", locale)}>
            {tr("blog.blogPages.security2")} →
          </a>
          <a href={localizedWebsiteHref("/docs#docs-routing", locale)}>
            {tr("blog.blogPages.architectureNotes")} →
          </a>
        </nav>
      </section>

      <section className="blogIndex blogListPlain">
        {posts.map((post) => (
          <a
            className="blogPostRow"
            href={localizedWebsiteHref("/blogs/" + post.slug, locale)}
            key={post.slug}
          >
            <div className="blogLeadMeta">
              <span>{post.tag}</span>
              <span>{post.date}</span>
              <span>{post.readTime}</span>
            </div>
            <h2>{post.title}</h2>
            <p>{post.summary}</p>
            <span className="blogReadLink">{tr("blog.blogPages.read")} →</span>
          </a>
        ))}
      </section>
    </PublicLayout>
  );
}
function BlogBackLink() {
  const { tr, locale } = useI18n();
  return (
    <a className="blogBack" href={localizedWebsiteHref("/blogs", locale)}>
      ← {tr("blog.blogPages.allPosts")}
    </a>
  );
}
export function GoVsTypescriptBenchmarkArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const rows = [
    {
      host: "Mac",
      source: "f68ab09",
      profile: "atomic",
      engine: "TS",
      read: "2.284",
      write: "5.327",
      undo: "5.345",
      rss: "100.69",
    },
    {
      host: "Mac",
      source: "f68ab09",
      profile: "atomic",
      engine: "Go",
      read: "0.964",
      write: "2.713",
      undo: "2.519",
      rss: "16.35",
    },
    {
      host: "Mac",
      source: "f68ab09",
      profile: "durable",
      engine: "TS",
      read: "2.149",
      write: "203.618",
      undo: "53.092",
      rss: "101.36",
    },
    {
      host: "Mac",
      source: "f68ab09",
      profile: "durable",
      engine: "Go",
      read: "0.972",
      write: "195.803",
      undo: "47.742",
      rss: "16.68",
    },
    {
      host: "Windows",
      source: "f68ab09",
      profile: "atomic",
      engine: "TS",
      read: "5.337",
      write: "20.977",
      undo: "16.091",
      rss: "95.79",
    },
    {
      host: "Windows",
      source: "f68ab09",
      profile: "atomic",
      engine: "Go",
      read: "22.660",
      write: "29.152",
      undo: "51.719",
      rss: "19.57",
    },
    {
      host: "Windows",
      source: "71cde96",
      profile: "atomic",
      engine: "TS",
      read: "5.422",
      write: "21.294",
      undo: "16.189",
      rss: "98.99",
    },
    {
      host: "Windows",
      source: "71cde96",
      profile: "atomic",
      engine: "Go",
      read: "4.168",
      write: "9.687",
      undo: "12.942",
      rss: "19.33",
    },
  ];
  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("blog.blogPages.engineeringNotesOct")}</span>
          <h1>{tr("blog.blogPages.whyRemoteArcChoseGoMeasured")}</h1>
          <p className="blogDeck">{tr("blog.blogPages.goDidNotWinEveryTest")}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>{tr("blog.blogPages.creatorOfRemoteArc")} · 9 Oct 2026 · 9 min</span>
            </div>
          </div>
        </header>
        <div className="blogArticleBody">
          <p>{tr("blog.blogPages.remoteArcIsNotABenchmark")}</p>
          <h2>{tr("blog.blogPages.whatExactlyDidWeBenchmark")}</h2>
          <p>{tr("blog.blogPages.l1MeasuresEachExecutionCoreThrough")}</p>
          <p>{tr("blog.blogPages.theTableBelowIsL2Only")}</p>
          <div
            className="benchmarkTableScroll"
            role="region"
            aria-label={tr("blog.blogPages.agentBenchmarkResultsScrollHorizontallyTo")}
            tabIndex={0}
          >
            <table className="benchmarkTable">
              <caption>{tr("blog.blogPages.fullAgentL2MedianTimeIn")}</caption>
              <thead>
                <tr>
                  <th scope="col">{tr("blog.blogPages.host")}</th>
                  <th scope="col">{tr("blog.blogPages.source")}</th>
                  <th scope="col">{tr("blog.blogPages.mode")}</th>
                  <th scope="col">{tr("blog.blogPages.engine")}</th>
                  <th scope="col">{tr("blog.blogPages.read2")}</th>
                  <th scope="col">{tr("blog.blogPages.write")}</th>
                  <th scope="col">Undo</th>
                  <th scope="col">RSS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.host + item.source + item.profile + item.engine}>
                    <th scope="row">{item.host}</th>
                    <td>
                      <code>{item.source}</code>
                    </td>
                    <td>{item.profile}</td>
                    <td>
                      <strong>{item.engine}</strong>
                    </td>
                    <td>{item.read}</td>
                    <td>{item.write}</td>
                    <td>{item.undo}</td>
                    <td>{item.rss}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="benchmarkMethodNote">{tr("blog.blogPages.readWriteUndoValuesComeFrom")}</p>
          <h2>{tr("blog.blogPages.theWindowsRegressionWeNearlyMissed")}</h2>
          <p>{tr("blog.blogPages.atSourceF68ab09GoOnWindows")}</p>
          <h2>{tr("blog.blogPages.whyDurableWritesLookSlowOn")}</h2>
          <p>{tr("blog.blogPages.inAtomicModeTheAgentWrites")}</p>
          <p>{tr("blog.blogPages.theLayeredExperimentKeepsWorkspaceWrites")}</p>
          <h2>{tr("blog.blogPages.longRunningResourcesAndTheDecision")}</h2>
          <p>{tr("blog.blogPages.underTheEarlierF68ab09NativeGo")}</p>
          <p>{tr("blog.blogPages.remoteArcThereforeShipsGoAs")}</p>
          <h2>{tr("blog.blogPages.whatWeHaveNotProvedYet")}</h2>
          <p>{tr("blog.blogPages.l3IsStillOutstandingAFormal")}</p>
          <div className="benchmarkSources">
            <h2>{tr("blog.blogPages.methodsAndSourceData")}</h2>
            <p>
              <a href="/docs/benchmark-baseline">
                {tr("blog.blogPages.macWindowsBaselineF68ab09")} ↗
              </a>
            </p>
            <p>
              <a href="/docs/benchmark-windows-followup">
                {tr("blog.blogPages.windowsPathHandlingFollowUpCde96")} ↗
              </a>
            </p>
            <p>
              <a href="/docs/benchmarks">
                {tr("blog.blogPages.reproductionStepsProfilesAndRawArtifact")} ↗
              </a>
            </p>
          </div>
          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.blogPages.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href="/downloads">{tr("blog.blogPages.downloadTheNativeGoAgent")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function BlogArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[0];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("blog.blogPages.buildingRemoteArc")}</span>
          <h1>{tr("blog.blogPages.whyIBuiltRemoteArcAi")}</h1>
          <p className="blogDeck">{tr("blog.blogPages.theMostUsefulAiIsNot")}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>
                {tr("blog.blogPages.creatorOfRemoteArc")} · {post.date} · {post.readTime}
              </span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr("blog.blogPages.iSpendALotOfTime")}</p>

          <p>{tr("blog.blogPages.thatGapIsWhatPushedMe")}</p>

          <h2>{tr("blog.blogPages.theGoalWasNeverFullControl")}</h2>
          <p>{tr("blog.blogPages.aLotOfRemoteAgentProducts")}</p>

          <p>{tr("blog.blogPages.remoteArcThereforeTreatsEveryComputer")}</p>

          <blockquote>{tr("blog.blogPages.theProductShouldMakePowerfulActions")}</blockquote>

          <h2>{tr("blog.blogPages.noPublicPortNoVpnNo")}</h2>
          <p>{tr("blog.blogPages.theLocalRemoteArcAgentCreates")}</p>

          <h2>{tr("blog.blogPages.mcpTurnedOutToBeThe")}</h2>
          <p>{tr("blog.blogPages.iDidNotWantRemoteArc")}</p>

          <p>{tr("blog.blogPages.todayTheSameRemoteArcEndpoint")}</p>

          <h2>{tr("blog.blogPages.theHardestPartIsNotExecution")}</h2>
          <p>{tr("blog.blogPages.runningACommandRemotelyIsTechnically")}</p>

          <p>{tr("blog.blogPages.thatIsWhyRemoteArcHas")}</p>

          <h2>{tr("blog.blogPages.whatIWantRemoteArcTo")}</h2>
          <p>{tr("blog.blogPages.iWantConnectingAnAiTo")}</p>

          <p>{tr("blog.blogPages.remoteArcIsStillEarlyI")}</p>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.blogPages.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href="/install/chatgpt">{tr("blog.blogPages.installRemoteArcForChatgpt")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function RemoteArcVsOpenClawArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[1];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("blog.blogPages.comparison")}</span>
          <h1>{tr("blog.blogPages.remoteArcVsOpenclawTwoDifferent")}</h1>
          <p className="blogDeck">{tr("blog.blogPages.theyCanBothHelpAiAct")}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>
                {tr("blog.blogPages.creatorOfRemoteArc")} · {post.date} · {post.readTime}
              </span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr("blog.blogPages.remoteArcIsSometimesComparedWith")}</p>

          <p>{tr("blog.blogPages.openclawDescribesItselfAsAnOpen")}</p>

          <p>{tr("blog.blogPages.remoteArcDeliberatelyOwnsADifferent")}</p>

          <h2>{tr("blog.blogPages.openclawIsAnAiHomeRemote")}</h2>
          <div className="blogCompareTable">
            <div className="blogCompareHead">
              <span></span>
              <strong>Remote Arc</strong>
              <strong>OpenClaw</strong>
            </div>
            <div>
              <span>{tr("blog.blogPages.primaryRole")}</span>
              <b>{tr("blog.blogPages.persistentAgentRuntimeForRealComputers")}</b>
              <b>{tr("blog.blogPages.selfHostedAssistantGatewayPlatform")}</b>
            </div>
            <div>
              <span>{tr("blog.blogPages.whoOwnsTheConversation")}</span>
              <b>{tr("blog.blogPages.yourExistingAiClient")}</b>
              <b>{tr("blog.blogPages.openclawGatewayAndItsChannels")}</b>
            </div>
            <div>
              <span>{tr("blog.blogPages.modelReasoning")}</span>
              <b>{tr("blog.blogPages.externalSourceRuntimeStateStaysIn")}</b>
              <b>{tr("blog.blogPages.partOfTheOpenclawPlatform")}</b>
            </div>
            <div>
              <span>MCP</span>
              <b>{tr("blog.blogPages.primaryRemoteInterfaceToPairedComputers")}</b>
              <b>{tr("blog.blogPages.oneInterfaceAmongSeveralCanServe")}</b>
            </div>
            <div>
              <span>{tr("blog.blogPages.deployment")}</span>
              <b>{tr("blog.blogPages.managedControlPlaneLocalAgent")}</b>
              <b>{tr("blog.blogPages.selfHostedGatewayByDefault")}</b>
            </div>
            <div>
              <span>{tr("blog.blogPages.computerControl")}</span>
              <b>{tr("blog.blogPages.filesProcessesTerminalAndExplicitDevice")}</b>
              <b>{tr("blog.blogPages.broaderAgentToolingIncludingComputerUse")}</b>
            </div>
          </div>

          <h2>{tr("blog.blogPages.theDeploymentPhilosophyIsAlmostOpposite")}</h2>
          <p>{tr("blog.blogPages.openclawEmphasizesThatTheAssistantState")}</p>

          <p>{tr("blog.blogPages.thatMeansOpenclawGivesTechnicallyInclined")}</p>

          <h2>{tr("blog.blogPages.theirRelationshipWithMcpIsDifferent")}</h2>
          <p>{tr("blog.blogPages.forRemoteArcMcpIsThe")}</p>

          <p>{tr("blog.blogPages.openclawUsesMcpInMoreThan")}</p>

          <h2>{tr("blog.blogPages.theyCanActuallyComplementEachOther")}</h2>
          <p>{tr("blog.blogPages.thisIsWhyIDoNot")}</p>

          <p>{tr("blog.blogPages.theTwoModelsCanEvenMeet")}</p>

          <div className="blogSourceNote">
            <strong>{tr("blog.blogPages.sourcesForTheOpenclawComparison")}</strong>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noreferrer">
              OpenClaw overview ↗
            </a>
            <a href="https://docs.openclaw.ai/cli/mcp" target="_blank" rel="noreferrer">
              OpenClaw MCP docs ↗
            </a>
            <a href="https://docs.openclaw.ai/nodes/computer-use" target="_blank" rel="noreferrer">
              OpenClaw computer-use docs ↗
            </a>
          </div>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.blogPages.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href="/install/chatgpt">{tr("blog.blogPages.tryRemoteArcWithChatgpt")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function PowerfulAccessArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[2];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("blog.blogPages.security")}</span>
          <h1>{tr("blog.blogPages.howRemoteArcKeepsAiAccess")}</h1>
          <p className="blogDeck">{tr("blog.blogPages.remoteControlBecomesUsefulOnlyWhen")}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>
                {tr("blog.blogPages.creatorOfRemoteArc")} · {post.date} · {post.readTime}
              </span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr("blog.blogPages.anAiThatCanOnlyTell")}</p>

          <h2>{tr("blog.blogPages.yourComputerNeverNeedsAPublic")}</h2>
          <p>{tr("blog.blogPages.theLocalRemoteArcAgentEstablishes")}</p>
          <blockquote>{tr("blog.blogPages.theConnectionStartsFromTheComputer")}</blockquote>

          <h2>{tr("blog.blogPages.pairingCreatesADeviceIdentityNot")}</h2>
          <p>{tr("blog.blogPages.everyPairedComputerReceivesItsOwn")}</p>

          <h2>{tr("blog.blogPages.oauthControlsTheAiClientSeparately")}</h2>
          <p>{tr("blog.blogPages.aPairedComputerAndAnAuthorized")}</p>

          <h2>{tr("blog.blogPages.permissionIsPerDeviceNotOne")}</h2>
          <p>{tr("blog.blogPages.aWorkLaptopAGamingPc")}</p>

          <div className="blogSecurityLayers">
            <span>
              <b>OAuth scope</b>
              <small>{tr("blog.blogPages.whatTheAiClientMayRequest")}</small>
            </span>
            <span>
              <b>Relay policy</b>
              <small>{tr("blog.blogPages.whatTheAccountAndDeviceAllow")}</small>
            </span>
            <span>
              <b>Local agent</b>
              <small>{tr("blog.blogPages.whatTheComputerActuallyExposes")}</small>
            </span>
            <span>
              <b>OS user</b>
              <small>{tr("blog.blogPages.theFinalOperatingSystemBoundary")}</small>
            </span>
          </div>

          <h2>{tr("blog.blogPages.sensitivePathsAndTrustedWriteLocations")}</h2>
          <p>{tr("blog.blogPages.remoteArcSeparatesReadVisibilityFrom")}</p>

          <h2>{tr("blog.blogPages.supportedEditsCanBeUndoneLocally")}</h2>
          <p>{tr("blog.blogPages.forSupportedRemoteArcFileMutations")}</p>

          <h2>{tr("blog.blogPages.auditMetadataIsUsefulWithoutBecoming")}</h2>
          <p>{tr("blog.blogPages.remoteArcRecordsOperationalMetadataSuch")}</p>

          <h2>{tr("blog.blogPages.theImportantLimitationPermissionsAreNot")}</h2>
          <p>{tr("blog.blogPages.onceYouExplicitlyEnableUnrestrictedTerminal")}</p>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.blogPages.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href="/security-model">{tr("blog.blogPages.readTheSecurityModel")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function ArchitectureArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[3];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("blog.blogPages.architecture")}</span>
          <h1>{tr("blog.blogPages.howRemoteArcWorksWorkerDurable")}</h1>
          <p className="blogDeck">{tr("blog.blogPages.remoteArcIsDeliberatelySplitInto")}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>
                {tr("blog.blogPages.creatorOfRemoteArc")} · {post.date} · {post.readTime}
              </span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr("blog.blogPages.fromTheOutsideRemoteArcLooks")}</p>

          <div className="blogArchitectureRail">
            <span>ChatGPT / Claude</span>
            <i>→</i>
            <span>Remote MCP</span>
            <i>→</i>
            <span>Worker</span>
            <i>→</i>
            <span>Durable Object</span>
            <i>→</i>
            <span>Local Agent</span>
            <i>→</i>
            <span>OS</span>
          </div>

          <h2>{tr("blog.blogPages.stepTheAiClientSeesA")}</h2>
          <p>{tr("blog.blogPages.chatgptClaudeOrAnotherCompatibleClient")}</p>

          <h2>{tr("blog.blogPages.stepOauthAnswersWhoTheAi")}</h2>
          <p>{tr("blog.blogPages.theMcpEndpointIsNotA")}</p>

          <h2>{tr("blog.blogPages.stepTheCloudflareWorkerIsThe")}</h2>
          <p>{tr("blog.blogPages.theWorkerHandlesThePublicHttp")}</p>

          <h2>{tr("blog.blogPages.stepD1KeepsDurableIdentityAnd")}</h2>
          <p>{tr("blog.blogPages.d1StoresTheDurableFactsThat")}</p>

          <h2>{tr("blog.blogPages.stepAPerUserDurableObject")}</h2>
          <p>{tr("blog.blogPages.liveDeviceConnectionsAreStatefulDurable")}</p>

          <h2>{tr("blog.blogPages.stepTheLocalAgentIsThe")}</h2>
          <p>{tr("blog.blogPages.theHostedControlPlaneNeverDirectly")}</p>

          <h2>{tr("blog.blogPages.stepTheResultTravelsBackNot")}</h2>
          <p>{tr("blog.blogPages.theAgentReturnsTheSpecificTool")}</p>

          <h2>{tr("blog.blogPages.whySplitControlPlaneAndExecution")}</h2>
          <p>{tr("blog.blogPages.theHostedSideIsGoodAt")}</p>

          <div className="blogSourceNote">
            <strong>{tr("blog.blogPages.exploreTheImplementation")}</strong>
            <a href="/docs#docs-routing">{tr("blog.blogPages.systemArchitecture")} →</a>
          </div>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.blogPages.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href="/docs/mcp">{tr("blog.blogPages.exploreTheMcpArchitecture")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
