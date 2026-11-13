import type { MessageKey } from "../../../locales/locale-catalog.js";
type Copy = MessageKey;
type Trace = { tool: string; input: Record<string, unknown>; output: Copy; working: Copy };
export type LocalCreativeExample = {
  id: "video" | "image";
  label: Copy;
  request: Copy;
  result: Copy;
  permission: Copy;
  link: string;
  traces: readonly Trace[];
};
export const LOCAL_CREATIVE_EXAMPLES: readonly LocalCreativeExample[] = [
  {
    id: "video",
    label: "marketing.home.localCreativeExamples.makeAVideo",
    link: "video-creation#video-gallery",
    request: "marketing.home.localCreativeExamples.makeASecondFilmAbout",
    result: "marketing.home.localCreativeExamples.theReturnIsAReal",
    permission: "marketing.home.localCreativeExamples.filesAuthorizedTerminalLocalVideo",
    traces: [
      {
        tool: "read_skill",
        input: { id: "video-creator" },
        working: "marketing.home.localCreativeExamples.checkingTheLocalVideoWorkflow",
        output: "marketing.home.localCreativeExamples.localRenderingWorkflowSelectedOrdinary",
      },
      {
        tool: "write_file",
        input: { path: "~/films/the-return/storyboard.md", mode: "rewrite" },
        working: "marketing.home.localCreativeExamples.writingFactsScenesAndTransitions",
        output:
          "marketing.home.localCreativeExamples.storyboardImpactCompressionRecoveryComparison",
      },
      {
        tool: "start_process",
        input: {
          cwd: "~/films",
          command: "python engine/render.py ./the-return",
          background: true,
        },
        working: "marketing.home.localCreativeExamples.renderingTheOriginalScenesOn",
        output: "marketing.home.localCreativeExamples.localRenderStartedCheckingThe",
      },
      {
        tool: "process_status",
        input: { process_id: "example-local-film" },
        working: "marketing.home.localCreativeExamples.waitingForTheRenderAnd",
        output: "marketing.home.localCreativeExamples.renderCompletedExitCode",
      },
      {
        tool: "start_process",
        input: {
          cwd: "~/films/the-return",
          command: "ffprobe -v error -show_format -show_streams final.mp4",
        },
        working: "marketing.home.localCreativeExamples.checkingTheExportedVideoAnd",
        output: "marketing.home.localCreativeExamples.mp4SecondsVideoAndAudio",
      },
    ],
  },
  {
    id: "image",
    label: "marketing.home.localCreativeExamples.createImages",
    link: "image-studio#image-gallery",
    request: "marketing.home.localCreativeExamples.createAnOriginalBasketballPoster",
    result: "marketing.home.localCreativeExamples.theOriginalPosterAndIllustration",
    permission: "marketing.home.localCreativeExamples.filesAuthorizedTerminalLocalDrawing",
    traces: [
      {
        tool: "read_skill",
        input: { id: "image-studio" },
        working: "marketing.home.localCreativeExamples.choosingTheLocalImageWorkflow",
        output: "marketing.home.localCreativeExamples.codeGraphicsSelectedCanvasDesign",
      },
      {
        tool: "write_file",
        input: { path: "~/art/poster.mjs", mode: "rewrite" },
        working: "marketing.home.localCreativeExamples.drawingTheCompositionBallGeometry",
        output: "marketing.home.localCreativeExamples.originalEditableDrawingSourcePrepared",
      },
      {
        tool: "start_process",
        input: { cwd: "~/art", command: "node poster.mjs" },
        working: "marketing.home.localCreativeExamples.renderingThePngsOnYour",
        output: "marketing.home.localCreativeExamples.imagesExportedLocallyNoImage",
      },
      {
        tool: "get_file_info",
        input: { path: "~/art/court-energy.png" },
        working: "marketing.home.localCreativeExamples.checkingImageDimensionsAndThe",
        output: "marketing.home.localCreativeExamples.pngCheckedAlongsideTheEditable",
      },
    ],
  },
];
export const findLocalCreative = (id: string) =>
  LOCAL_CREATIVE_EXAMPLES.find((example) => example.id === id);
