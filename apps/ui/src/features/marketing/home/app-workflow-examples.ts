import type { MessageKey } from "../../../locales/locale-catalog.js";
type Copy = MessageKey;
type Trace = {
  tool: "list_apps" | "call_app";
  provider?: string;
  input: Record<string, unknown>;
  output: Copy;
  working: Copy;
};
export type AppWorkflowExample = {
  id: string;
  connectionProvider: string;
  label: Copy;
  title: Copy;
  request: Copy;
  result: Copy;
  permission: Copy;
  brands: { brand: string; name: string }[];
  traces: Trace[];
};
const ids = {
  github: "11111111-1111-4111-8111-111111111111",
  vercel: "22222222-2222-4222-8222-222222222222",
  slack: "33333333-3333-4333-8333-333333333333",
  google_drive: "55555555-5555-4555-8555-555555555555",
  notion: "66666666-6666-4666-8666-666666666666",
};
const call = (
  provider: keyof typeof ids,
  operation: string,
  args: Record<string, unknown>,
  requestId: string,
) => ({ connectionId: ids[provider], operation, arguments: args, requestId });
export const APP_WORKFLOW_EXAMPLES: readonly AppWorkflowExample[] = [
  {
    id: "release",
    connectionProvider: "vercel",
    label: "marketing.home.appWorkflowExamples.githubVercel",
    title: "marketing.home.appWorkflowExamples.knowWhatShippedCatchWhat",
    request: "marketing.home.appWorkflowExamples.checkOurMergedGithubPrs",
    result: "marketing.home.appWorkflowExamples.fourMergedPrsCheckedOne",
    permission: "marketing.home.appWorkflowExamples.connectedGithubVercelAndSlack",
    brands: [
      { brand: "github", name: "GitHub" },
      { brand: "vercel", name: "Vercel" },
      { brand: "slack", name: "Slack" },
    ],
    traces: [
      {
        tool: "list_apps",
        input: { provider: "vercel" },
        output: "marketing.home.appWorkflowExamples.vercelAccountAndAvailableOperation",
        working: "marketing.home.appWorkflowExamples.checkingConnectedDeploymentTools",
      },
      {
        tool: "call_app",
        provider: "github",
        input: call(
          "github",
          "pulls.list",
          { repo: "team/product", state: "closed", limit: 30 },
          "demo-release-prs",
        ),
        output: "marketing.home.appWorkflowExamples.mergedPullRequestsSourceLinks",
        working: "marketing.home.appWorkflowExamples.readingMergedChangesAndTheir",
      },
      {
        tool: "call_app",
        provider: "vercel",
        input: call(
          "vercel",
          "deployments.list",
          { projectId: "example-project", limit: 5 },
          "demo-release-deployments",
        ),
        output: "marketing.home.appWorkflowExamples.productionReadyLatestPreviewError",
        working: "marketing.home.appWorkflowExamples.crossCheckingDeploymentStatus",
      },
      {
        tool: "call_app",
        provider: "slack",
        input: call(
          "slack",
          "messages.send",
          {
            channel: "C_PRODUCT",
            text: "Release review: four merged PRs. Production is ready; one preview needs investigation. Sources: https://github.com/example/product/pulls and https://vercel.com/example/product/deployments",
          },
          "demo-release-update",
        ),
        output: "marketing.home.appWorkflowExamples.messagePostedToProductSource",
        working: "marketing.home.appWorkflowExamples.postingTheReleaseUpdateAnd",
      },
    ],
  },
  {
    id: "knowledge",
    connectionProvider: "google_drive",
    label: "marketing.home.appWorkflowExamples.driveNotion",
    title: "marketing.home.appWorkflowExamples.turnScatteredFilesIntoShared",
    request: "marketing.home.appWorkflowExamples.findTheLaunchBriefIn",
    result: "marketing.home.appWorkflowExamples.createdANotionPageWith",
    permission: "marketing.home.appWorkflowExamples.connectedGoogleDriveAndNotion",
    brands: [
      { brand: "googledrive", name: "Google Drive" },
      { brand: "notion", name: "Notion" },
    ],
    traces: [
      {
        tool: "list_apps",
        input: { provider: "google_drive" },
        output: "marketing.home.appWorkflowExamples.googleDriveAccountAndDocument",
        working: "marketing.home.appWorkflowExamples.findingTheAuthorizedDocumentTools",
      },
      {
        tool: "call_app",
        provider: "google_drive",
        input: call(
          "google_drive",
          "files.list",
          {
            query: "mimeType = 'application/vnd.google-apps.document' and name contains 'Launch'",
            limit: 5,
          },
          "demo-knowledge-find",
        ),
        output: "marketing.home.appWorkflowExamples.launchBriefFoundOriginalDocument",
        working: "marketing.home.appWorkflowExamples.locatingTheLaunchBrief",
      },
      {
        tool: "call_app",
        provider: "google_drive",
        input: call(
          "google_drive",
          "files.exportText",
          { id: "example-launch-document" },
          "demo-knowledge-read",
        ),
        output: "marketing.home.appWorkflowExamples.originalBriefReadDecisionsAnd",
        working: "marketing.home.appWorkflowExamples.readingTheSourceAndOrganizing",
      },
      {
        tool: "call_app",
        provider: "notion",
        input: call(
          "notion",
          "pages.create",
          {
            parentPageId: "77777777-7777-4777-8777-777777777777",
            title: "Launch decisions and next steps",
            text: "Source: https://docs.google.com/document/d/example-launch-document\nDecision: ship the approved release after preview checks pass.\nNext: investigate the failing preview and review the launch checklist.",
          },
          "demo-knowledge-page",
        ),
        output: "marketing.home.appWorkflowExamples.notionPageCreatedSourceLink",
        working: "marketing.home.appWorkflowExamples.creatingTheNotionPageWith",
      },
    ],
  },
];
export const findAppWorkflow = (id: string) =>
  APP_WORKFLOW_EXAMPLES.find((example) => example.id === id);
