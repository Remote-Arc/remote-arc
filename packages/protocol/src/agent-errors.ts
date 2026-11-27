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
  | "notInstalled"
  | AgentRequestCause;

/**
 * Why a request about an agent did not go through, from the Relay's error
 * code. The code arrives alone (the apps keep only the code) or at the start
 * of the Relay's message ("CODE: ..."), as the Dashboard keeps it.
 */
export type AgentRequestCause =
  | "computerOffline"
  | "computerTimeout"
  | "notStarted"
  | "agentWorking"
  | "awaitingAnswer"
  | "sessionUnknown"
  | "sessionNoFolder"
  | "noWorktree"
  | "inFolder"
  | "tooManyRuns"
  | "fanoutLimit"
  | "folderShared"
  | "inputsNotDelivered"
  | "attachmentGone"
  | "skillGone"
  | "mentionGone"
  | "tooManyInputs"
  | "promptLength"
  | "noTrustedFolder"
  | "outsideTrustedFolders"
  | "computerGone"
  | "nothingToApprove"
  | "upgradeRequired"
  | "pushFailed"
  | "commitFailed"
  | "diffFailed"
  | "mergeNoBranch"
  | "mergeWrongBranch"
  | "mergeDirty"
  | "mergeConflict"
  | "setupNotStarted"
  | "signInNotStarted"
  | "signInCode"
  | "unreachable"
  | "serverError";

const REQUEST_CAUSES: Record<string, AgentRequestCause> = {
  AGENT_COMPUTER_OFFLINE: "computerOffline",
  DEVICE_OFFLINE: "computerOffline",
  AGENT_COMPUTER_TIMEOUT: "computerTimeout",
  DEVICE_TIMEOUT: "computerTimeout",
  AGENT_TURN_NOT_STARTED: "notStarted",
  AGENT_RUN_ACTIVE: "agentWorking",
  AGENT_AWAITING_ANSWER: "awaitingAnswer",
  AGENT_SESSION_UNKNOWN: "sessionUnknown",
  INVALID_SESSION: "sessionNoFolder",
  AGENT_RUN_NO_WORKTREE: "noWorktree",
  AGENT_RUN_IN_FOLDER: "inFolder",
  AGENT_RUNS_BUSY: "tooManyRuns",
  AGENT_FANOUT_LIMIT: "fanoutLimit",
  AGENT_FOLDER_SHARED: "folderShared",
  AGENT_INPUTS_NOT_DELIVERED: "inputsNotDelivered",
  AGENT_ATTACHMENT_NOT_FOUND: "attachmentGone",
  AGENT_SKILL_NOT_FOUND: "skillGone",
  AGENT_MENTION_NOT_FOUND: "mentionGone",
  TOO_MANY_INPUTS: "tooManyInputs",
  INVALID_PROMPT: "promptLength",
  NO_TRUSTED_FOLDER: "noTrustedFolder",
  FOLDER_OUTSIDE_TRUSTED_FOLDERS: "outsideTrustedFolders",
  SESSION_OUTSIDE_TRUSTED_FOLDERS: "outsideTrustedFolders",
  DEVICE_NOT_FOUND: "computerGone",
  NO_APPROVAL_PENDING: "nothingToApprove",
  PLAN_UPGRADE_REQUIRED: "upgradeRequired",
  AGENT_PUSH_FAILED: "pushFailed",
  AGENT_COMMIT_FAILED: "commitFailed",
  AGENT_DIFF_FAILED: "diffFailed",
  AGENT_MERGE_NO_BRANCH: "mergeNoBranch",
  AGENT_MERGE_WRONG_BRANCH: "mergeWrongBranch",
  AGENT_MERGE_DIRTY: "mergeDirty",
  AGENT_MERGE_CONFLICT: "mergeConflict",
  SETUP_NOT_STARTED: "setupNotStarted",
  SIGN_IN_NOT_STARTED: "signInNotStarted",
  INVALID_CODE: "signInCode",
  // The apps' own codes for a request that never reached the Relay, or a server failure.
  FAILED: "unreachable",
  NETWORK_ERROR: "unreachable",
};

const RUN_CAUSES: Record<string, AgentErrorCause> = {
  AGENT_NOT_GIT_REPO: "notGitRepo",
  AGENT_TOOL_DISABLED: "toolDisabled",
  AGENT_NO_OUTPUT: "noOutput",
};

/** "AGENT_X" from "AGENT_X" or "AGENT_X: what happened". */
const leadingCode = (error: string) => /^([A-Z][A-Z0-9_]+)(?::|$)/.exec(error.trim())?.[1];

/** The cause for a Relay error code alone or at the start of its message. */
export function agentRequestCause(error: string): AgentRequestCause | null {
  const code = leadingCode(error);
  if (!code) return null;
  if (REQUEST_CAUSES[code]) return REQUEST_CAUSES[code];
  return /^HTTP_5\d\d$/.test(code) ? "serverError" : null;
}

/** Causes whose explanation is followed by the agent's own first line (it says when a limit resets). */
export const AGENT_ERROR_WITH_DETAIL: readonly AgentErrorCause[] = [
  "usageLimit",
  "noCredits",
  "noAccess",
];

export function agentErrorCause(error: string): AgentErrorCause | null {
  const code = leadingCode(error);
  // The folder is no repository; the computer's Devices settings turn off a
  // tool every run needs; the agent failed and printed nothing.
  if (code && RUN_CAUSES[code]) return RUN_CAUSES[code];
  const request = agentRequestCause(error);
  if (request) return request;
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
