import type { MessageKey } from "../../../locales/locale-catalog.js";
import type { Translate } from "../../../locales/locale-catalog.js";
export function communityExperience(id: string, tr: Translate) {
  const names: Record<string, [MessageKey, MessageKey]> = {
    "manim-video": [
      "arc.skills.arcCommunityExperience.manimMathematicalAnimation",
      "arc.skills.arcCommunityExperience.animateGeometryFormulasAlgorithmsAnd",
    ],
    "blender-mcp": [
      "arc.skills.arcCommunityExperience.blenderMcpDCreation",
      "arc.skills.arcCommunityExperience.buildAndInspectRealBlender",
    ],
    "browser-operator": [
      "arc.skills.arcCommunityExperience.browserOperator",
      "arc.skills.arcCommunityExperience.operateAnAuthorizedBrowserUsing",
    ],
    "autonomous-browser": [
      "arc.skills.arcCommunityExperience.autonomousBrowser",
      "arc.skills.arcCommunityExperience.planMultiStepBrowserWork",
    ],
    "desktop-operator": [
      "arc.skills.arcCommunityExperience.desktopOperator",
      "arc.skills.arcCommunityExperience.movePointerDragTypeAnd",
    ],
    "video-creator": [
      "arc.skills.arcCommunityExperience.videoCreator",
      "arc.skills.arcCommunityExperience.chooseRemotionHyperframesOrOpenfilm",
    ],
    "image-studio": [
      "arc.skills.arcCommunityExperience.imageStudio",
      "arc.skills.arcCommunityExperience.drawPostersIllustrationsAndSeeded",
    ],
    "ui-inspector": [
      "arc.skills.arcCommunityExperience.uiInspector",
      "arc.skills.arcCommunityExperience.understandScreenshotControlsWithDom",
    ],
    "transcribe-subtitles": [
      "arc.skills.arcCommunityExperience.transcribeSubtitles",
      "arc.skills.arcCommunityExperience.transcribeAudioVideoIntoFinished",
    ],
    "research-reports": [
      "arc.skills.arcCommunityExperience.researchReports",
      "arc.skills.arcCommunityExperience.gatherCitedEvidenceFromAuthorized",
    ],
    "scheduled-routines": [
      "arc.skills.arcCommunityExperience.scheduledRoutines",
      "arc.skills.arcCommunityExperience.createRepeatableBoundedResumableTasks",
    ],
    "remotion-video": [
      "arc.skills.arcCommunityExperience.remotionVideo",
      "arc.skills.arcCommunityExperience.coreLocalVideoSkillReact",
    ],
    "hyperframes-video": [
      "arc.skills.arcCommunityExperience.hyperframesVideo",
      "arc.skills.arcCommunityExperience.localHtmlSvgCanvasAnd",
    ],
    "openfilm-video": [
      "arc.skills.arcCommunityExperience.openfilmVideo",
      "arc.skills.arcCommunityExperience.localShotBasedVideoAssembly",
    ],
    "map-creator": [
      "arc.skills.arcCommunityExperience.mapCreator",
      "arc.skills.arcCommunityExperience.createRealSvgMapsAnd",
    ],
    "community-vibe-knowledge-film": [
      "arc.skills.arcCommunityExperience.vibeKnowledgeFilms",
      "arc.skills.arcCommunityExperience.createOriginalCinematicKnowledgeFilms",
    ],
    "community-a-stock-data": [
      "arc.skills.arcCommunityExperience.aShareMarketData",
      "arc.skills.arcCommunityExperience.fetchRealASharePrices",
    ],
    "community-nuwa": [
      "arc.skills.arcCommunityExperience.nuwaCreateThinkingSkills",
      "arc.skills.arcCommunityExperience.researchPublicOrUserProvided",
    ],
    "community-nuwa-andrej-karpathy": [
      "arc.skills.arcCommunityExperience.andrejKarpathyThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn",
    ],
    "community-nuwa-elon-musk": [
      "arc.skills.arcCommunityExperience.elonMuskThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn2",
    ],
    "community-nuwa-feynman": [
      "arc.skills.arcCommunityExperience.richardFeynmanThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn3",
    ],
    "community-nuwa-ilya-sutskever": [
      "arc.skills.arcCommunityExperience.ilyaSutskeverThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn4",
    ],
    "community-nuwa-mrbeast": [
      "arc.skills.arcCommunityExperience.mrbeastThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn5",
    ],
    "community-nuwa-munger": [
      "arc.skills.arcCommunityExperience.charlieMungerThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn6",
    ],
    "community-nuwa-naval": [
      "arc.skills.arcCommunityExperience.navalRavikantThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn7",
    ],
    "community-nuwa-paul-graham": [
      "arc.skills.arcCommunityExperience.paulGrahamThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn8",
    ],
    "community-nuwa-steve-jobs": [
      "arc.skills.arcCommunityExperience.steveJobsThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn9",
    ],
    "community-nuwa-sun-yuchen": [
      "arc.skills.arcCommunityExperience.sunYuchenThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn10",
    ],
    "community-nuwa-taleb": [
      "arc.skills.arcCommunityExperience.nassimTalebThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn11",
    ],
    "community-nuwa-trump": [
      "arc.skills.arcCommunityExperience.donaldTrumpThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn12",
    ],
    "community-nuwa-x-mentor": [
      "arc.skills.arcCommunityExperience.xPublishingMentorThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn13",
    ],
    "community-nuwa-zhang-yiming": [
      "arc.skills.arcCommunityExperience.zhangYimingThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn14",
    ],
    "community-nuwa-zhangxuefeng": [
      "arc.skills.arcCommunityExperience.zhangXuefengThinkingFramework",
      "arc.skills.arcCommunityExperience.nuwaSourceBasedPerspectiveOn15",
    ],

    "arc-docx": [
      "arc.skills.arcCommunityExperience.wordDocuments",
      "arc.skills.arcCommunityExperience.createEditableDocxFilesAnd",
    ],
    "arc-xlsx": [
      "arc.skills.arcCommunityExperience.excelSpreadsheets",
      "arc.skills.arcCommunityExperience.buildXlsxWorkbooksCheckSource",
    ],
    "arc-pptx": [
      "arc.skills.arcCommunityExperience.powerpointPresentations",
      "arc.skills.arcCommunityExperience.createEditableDecksFromReal",
    ],
    "arc-pdf": [
      "arc.skills.arcCommunityExperience.pdfWorkflows",
      "arc.skills.arcCommunityExperience.inspectMergeSplitAndRotate",
    ],
    "community-statistical-analysis": [
      "arc.skills.arcCommunityExperience.statisticalAnalysis",
      "arc.skills.arcCommunityExperience.chooseTestsInspectAssumptionsAnd",
    ],
    "community-scikit-learn": [
      "arc.skills.arcCommunityExperience.machineLearning",
      "arc.skills.arcCommunityExperience.buildPreprocessingAndEvaluationPipelines",
    ],
    "community-seaborn": [
      "arc.skills.arcCommunityExperience.statisticalVisualization",
      "arc.skills.arcCommunityExperience.exploreDistributionsCategoriesAndRelationships",
    ],
    "community-networkx": [
      "arc.skills.arcCommunityExperience.graphAndNetworkAnalysis",
      "arc.skills.arcCommunityExperience.analyzePathsCentralityAndCommunities",
    ],
    "community-frontend-design": [
      "arc.skills.arcCommunityExperience.frontendDesign",
      "arc.skills.arcCommunityExperience.anthropicSInterfaceDesignSkill",
    ],
    "community-webapp-testing": [
      "arc.skills.arcCommunityExperience.webAppTesting",
      "arc.skills.arcCommunityExperience.realPlaywrightTestsWithScreenshots",
    ],
    "community-playwright": [
      "arc.skills.arcCommunityExperience.browserAutomation",
      "arc.skills.arcCommunityExperience.microsoftSPlaywrightCliSkill",
    ],
    "community-react-best-practices": [
      "arc.skills.arcCommunityExperience.reactPerformance",
      "arc.skills.arcCommunityExperience.vercelEngineeringRulesForReal",
    ],
    "community-web-design-guidelines": [
      "arc.skills.arcCommunityExperience.webInterfaceReview",
      "arc.skills.arcCommunityExperience.reviewKeyboardBehaviorAccessibilityForms",
    ],
    "community-mcp-builder": [
      "arc.skills.arcCommunityExperience.mcpServerBuilder",
      "arc.skills.arcCommunityExperience.anthropicSMcpDevelopmentPackage",
    ],
    "community-polars": [
      "arc.skills.arcCommunityExperience.dataAnalysisWithPolars",
      "arc.skills.arcCommunityExperience.analyzeActualDataWithPolars",
    ],
    "community-matplotlib": [
      "arc.skills.arcCommunityExperience.chartsWithMatplotlib",
      "arc.skills.arcCommunityExperience.buildAndExportChartsFrom",
    ],
  };
  const item = names[id];
  return item ? { title: tr(item[0]), description: tr(item[1]) } : undefined;
}
