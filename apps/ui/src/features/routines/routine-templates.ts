/**
 * The routines people can start from. Each one has a prompt for Arc and a
 * prompt for the person's own AI, which has to be told to use Remote Arc.
 */
export const ROUTINE_TEMPLATES = [
  {
    id: "general",
    name: "routines.templates.general",
    detail: "routines.templates.generalDetail",
    arcPrompt: "routines.page.newRoutinePrompt",
    aiPrompt: "routines.templates.generalAiPrompt",
  },
  {
    id: "price-watch",
    name: "routines.empty.priceWatch",
    detail: "routines.empty.priceWatchDetail",
    arcPrompt: "routines.empty.priceWatchPrompt",
    aiPrompt: "routines.templates.priceWatchAiPrompt",
  },
  {
    id: "nightly-tests",
    name: "routines.empty.nightlyTests",
    detail: "routines.empty.nightlyTestsDetail",
    arcPrompt: "routines.empty.nightlyTestsPrompt",
    aiPrompt: "routines.templates.nightlyTestsAiPrompt",
  },
  {
    id: "data-export",
    name: "routines.empty.dataExport",
    detail: "routines.empty.dataExportDetail",
    arcPrompt: "routines.empty.dataExportPrompt",
    aiPrompt: "routines.templates.dataExportAiPrompt",
  },
  {
    id: "host-check",
    name: "routines.empty.hostCheck",
    detail: "routines.empty.hostCheckDetail",
    arcPrompt: "routines.empty.hostCheckPrompt",
    aiPrompt: "routines.templates.hostCheckAiPrompt",
  },
] as const;

export type RoutineTemplate = (typeof ROUTINE_TEMPLATES)[number];
export type RoutineTemplateId = RoutineTemplate["id"];

/**
 * Links that open a new ChatGPT or Claude conversation with the prompt already
 * typed in. Both services fill the message box and leave sending to the person.
 */
export function aiConversationLinks(prompt: string) {
  const q = encodeURIComponent(prompt);
  return {
    chatgpt: `https://chatgpt.com/?q=${q}`,
    claude: `https://claude.ai/new?q=${q}`,
  };
}
