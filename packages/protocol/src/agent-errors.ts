// The known causes behind a coding agent's error, read from what the Relay or
// the agent itself reported. The Dashboard and the apps each put the cause in
// the person's language; anything unrecognised is shown as it came.

export type AgentErrorCause =
  | "notGitRepo"
  | "toolDisabled"
  | "noOutput"
  | "usageLimit"
  | "noCredits"
  | "noAccess"
  | "signedOut"
  | "notInstalled";

/** Causes whose explanation is followed by the agent's own first line (it says when a limit resets). */
export const AGENT_ERROR_WITH_DETAIL: readonly AgentErrorCause[] = [
  "usageLimit",
  "noCredits",
  "noAccess",
];

export function agentErrorCause(error: string): AgentErrorCause | null {
  if (error.startsWith("AGENT_NOT_GIT_REPO:")) return "notGitRepo";
  // The computer's Devices settings turn off a tool every run needs.
  if (error.startsWith("AGENT_TOOL_DISABLED:")) return "toolDisabled";
  // The agent failed and printed nothing, so the Relay can only say so.
  if (error.startsWith("AGENT_NO_OUTPUT:")) return "noOutput";
  if (/usage limit|limit reached|hit your (usage )?limit|out of (extra )?usage/i.test(error))
    return "usageLimit";
  if (
    /credit balance is too low|insufficient[_ ]quota|quota exceeded|exceeded your current quota/i.test(
      error,
    )
  )
    return "noCredits";
  if (
    /does not have access to claude code|not (available|included) (on|in|with) your plan|subscription (is )?required|requires a (claude|chatgpt) (pro|plus|max|team)/i.test(
      error,
    )
  )
    return "noAccess";
  if (
    /not logged in|please run \/login|codex login|oauth token (has )?expired|token has expired/i.test(
      error,
    )
  )
    return "signedOut";
  if (/command not found|is not recognized as an internal or external command/i.test(error))
    return "notInstalled";
  return null;
}

/** The agent's own words that follow a cause in AGENT_ERROR_WITH_DETAIL. */
export const agentErrorDetail = (error: string) => " " + error.split("\n")[0]!.slice(0, 200);
