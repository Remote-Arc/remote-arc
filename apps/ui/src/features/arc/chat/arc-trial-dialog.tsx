import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ArcAccess } from "../../../hooks/arc/use-arc-chat.js";
import type { Translate } from "../../../locales/locale-catalog.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { PRO_TRIAL_CHECKOUT_HREF } from "../../billing/arc-billing-client.js";
import "../../../styles/arc/chat/arc-trial-dialog.css";

/**
 * Shown when someone without Arc access presses Send. It names the next step for
 * their account (the Pro trial at checkout, the Arc trial here, or a plan once the
 * trial has ended) and leaves the draft in the composer.
 */
export function ArcTrialDialog({
  access,
  busy,
  tr,
  onClose,
  onStartArcTrial,
}: {
  access: ArcAccess;
  busy: boolean;
  tr: Translate;
  onClose: () => void;
  onStartArcTrial: () => void;
}) {
  const primary = useRef<HTMLElement | null>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eligible = access.status === "eligible";
  const title = eligible
    ? access.proTrial
      ? tr("arc.chat.trialDialog.proTitle")
      : tr("arc.chat.trialDialog.arcTitle")
    : access.status === "excluded"
      ? tr("arc.chat.arcNativeChat.yourArcTrialHasEnded")
      : tr("arc.chat.arcNativeChat.yourTrialHasEnded");
  const detail = eligible
    ? access.proTrial
      ? tr("billing.proTrial.chatNote")
      : tr("arc.chat.arcNativeChat.noCardNoModelApiKey")
    : tr("arc.chat.trialDialog.endedBody");

  return createPortal(
    <div className="arcTrialDialogBackdrop" role="presentation" onClick={onClose}>
      <section
        className="arcTrialDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arc-trial-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="arcTrialDialogClose"
          aria-label={tr("arc.chat.arcNativeChat.close")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="arcTrialDialogIcon" aria-hidden="true">
          <Icon name="spark" size={20} />
        </span>
        <h2 id="arc-trial-dialog-title">{title}</h2>
        <p>{detail}</p>
        <p className="arcTrialDialogDraft">{tr("arc.chat.trialDialog.draftKept")}</p>
        <div className="arcTrialDialogActions">
          {eligible && access.proTrial ? (
            <a
              ref={(node) => {
                primary.current = node;
              }}
              className="arcRadiantCta"
              href={PRO_TRIAL_CHECKOUT_HREF}
            >
              {tr("arc.chat.arcNativeChat.startFreeTrial")}
              <Icon name="arrowUpRight" size={14} />
            </a>
          ) : eligible ? (
            <button
              ref={(node) => {
                primary.current = node;
              }}
              type="button"
              className="arcRadiantCta"
              disabled={busy}
              onClick={onStartArcTrial}
            >
              {tr("arc.chat.arcNativeChat.startFreeTrial")}
            </button>
          ) : (
            <a
              ref={(node) => {
                primary.current = node;
              }}
              className="arcRadiantCta"
              href="/checkout"
            >
              {tr("arc.chat.arcNativeChat.viewPlans")}
              <Icon name="arrowUpRight" size={14} />
            </a>
          )}
          {eligible && access.proTrial && (
            <a className="ghostButton" href="/checkout">
              {tr("arc.chat.arcNativeChat.viewPlans")}
            </a>
          )}
          <button type="button" className="ghostButton" onClick={onClose}>
            {tr("arc.chat.trialDialog.notNow")}
          </button>
        </div>
      </section>
    </div>,
    document.querySelector(".appFrame") || document.body,
  );
}
