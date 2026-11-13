import { useState } from "react";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useI18n } from "../use-i18n.js";

const IS_PREVIEW = import.meta.env?.VITE_UI_PREVIEW === "1";

export type CareersInterest = {
  name: string;
  email: string;
  area: string;
  link: string;
  message: string;
  consent: boolean;
  /** Honeypot: people never see or fill it; the server rejects any value. */
  website: string;
};

/** The submission inbox caps a message at 3000 characters, including the area and link lines. */
export const CAREERS_MESSAGE_LIMIT = 2500;

/** The body the website submission endpoint expects; the area and link lead the message. */
export function careersSubmissionBody(form: CareersInterest, requestId: string) {
  const link = form.link.trim();
  const header = "Area: " + form.area + (link ? "\nLink: " + link : "");
  return {
    category: "feedback",
    source: "careers",
    name: form.name.trim(),
    email: form.email.trim(),
    message: header + "\n\n" + form.message.trim(),
    consent: true,
    website: form.website,
    requestId,
  };
}

/**
 * Sends a careers note to the website submission inbox the feedback form uses. It is
 * stored as feedback with source "careers", so it needs no new table and shows up,
 * labelled, in Admin.
 */
export function useCareersInterest() {
  const { tr } = useI18n();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(form: CareersInterest) {
    if (IS_PREVIEW) {
      setError(tr("marketing.publicEngagement.thisIsADesignPreviewSubmission"));
      return;
    }
    if (!form.consent) {
      setError(tr("marketing.publicEngagement.pleaseConfirmTheContactPrivacyAgreement"));
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/public/engagement", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(careersSubmissionBody(form, crypto.randomUUID())),
      });
      if (!response.ok) {
        const detail = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        throw new Error(
          detail.error === "RATE_LIMITED"
            ? tr("marketing.publicEngagement.tooManySubmissionsTryAgainIn")
            : tr("marketing.publicEngagement.submissionUnavailablePleaseRetryLater"),
        );
      }
      setStatus("sent");
    } catch (cause) {
      setStatus("idle");
      setError(
        cause instanceof Error
          ? cause.message
          : tr("marketing.publicEngagement.networkErrorPleaseRetry"),
      );
    }
  }

  return { status, error, submit, preview: IS_PREVIEW };
}
