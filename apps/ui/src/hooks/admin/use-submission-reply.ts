import { useState } from "react";

/** Opens the support conversation for a website submission, so the operator can
 * answer it from support@ in the Support inbox. Opening the same submission again
 * returns the same conversation. */
export function useSubmissionReply(onOpened: (threadId: string) => void) {
  const [openingId, setOpeningId] = useState("");
  const [failed, setFailed] = useState(false);

  async function replyByEmail(submissionId: string) {
    if (openingId) return;
    setOpeningId(submissionId);
    setFailed(false);
    try {
      const response = await fetch(
        "/api/admin/submissions/" + encodeURIComponent(submissionId) + "/support-thread",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const value = (await response.json().catch(() => null)) as { threadId?: unknown } | null;
      if (!response.ok || typeof value?.threadId !== "string") throw Error(String(response.status));
      onOpened(value.threadId);
    } catch {
      setFailed(true);
    } finally {
      setOpeningId("");
    }
  }

  return { openingId, failed, replyByEmail };
}
