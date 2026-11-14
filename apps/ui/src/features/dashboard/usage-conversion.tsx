import React from "react";
import { PRO_CHECKOUT_SLUG } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import type { MonthlyUsage } from "../../types/app-types.js";
import "../../styles/dashboard/usage-conversion.css";

const DAY_MS = 86_400_000;

export function UsageConversionBanner({
  usage,
  onManagePlan,
  pricingUrl,
  sectionRef,
}: {
  usage: MonthlyUsage | null | undefined;
  onManagePlan: () => void;
  pricingUrl: string;
  /** Lets the Overview measure the banner for its loading placeholder. */
  sectionRef?: React.Ref<HTMLElement>;
}) {
  const { tr, locale } = useI18n();
  const overflow = usage?.freeOverflow,
    // A Free account below its allowance: calls continue past it, so say how.
    after = overflow ? undefined : usage?.afterAllowance;
  if (!usage || usage.unlimited || !usage.limit) return null;
  if (!overflow && usage.used / usage.limit < 0.8) return null;
  const ratio = Math.min(1, usage.used / usage.limit),
    ended = ratio >= 1;
  const remaining = Math.max(0, usage.limit - usage.used);
  const [y, m] = usage.month.split("-").map(Number);
  const reset = new Date(Date.UTC(y ?? 2026, m ?? 1, 1));
  const formatDate = (date: Date) =>
    Number.isNaN(date.getTime())
      ? "—"
      : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
        }).format(date);
  const resetText = formatDate(reset);
  const trial = overflow?.trial ?? null,
    onTrial = Boolean(trial?.active),
    // An account that has paid before gets no trial and goes straight to the slow lane.
    slowLane = Boolean(
      overflow && ((trial && !trial.active) || (!trial && overflow.trialAvailable === false)),
    );
  const trialEnd = trial ? formatDate(new Date(trial.endsAt)) : "";
  const daysLeft = trial
    ? Math.max(0, Math.ceil((Date.parse(trial.endsAt) - Date.now()) / DAY_MS))
    : 0;
  const perMinute = (overflow ?? after)?.slowLaneCallsPerMinute ?? 0,
    trialDays = (overflow ?? after)?.trialDays ?? 0;
  // Their own pace makes "unlimited" concrete: calls so far, projected to the month end.
  const monthStart = Date.UTC(y ?? 2026, (m ?? 1) - 1, 1);
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - monthStart) / DAY_MS));
  const monthDays = Math.round((reset.getTime() - monthStart) / DAY_MS) || 30;
  const pace = Math.round((usage.used / elapsedDays) * monthDays);
  const checkoutHref = "/checkout?product=" + PRO_CHECKOUT_SLUG;

  const kicker = onTrial
    ? tr("dashboard.usageConversion.connectUnlimitedTrial")
    : slowLane
      ? tr("dashboard.usageConversion.connectSlowLane")
      : tr("dashboard.usageConversion.connectMonthlyAllowance");
  const heading = onTrial
    ? daysLeft <= 2
      ? tr("dashboard.usageConversion.yourFullSpeedTrialEndsIn", {
          daysLeft,
          days: daysLeft === 1 ? "day" : "days",
        })
      : tr("dashboard.usageConversion.yourAgentsAreOnADay", { trialDays })
    : slowLane
      ? tr("dashboard.usageConversion.yourAgentsAreInTheSlow")
      : ended
        ? overflow
          ? tr("dashboard.usageConversion.yourFreeCallsAreUsedUp")
          : tr("dashboard.usageConversion.yourMonthlyCallsAreUsedUp")
        : after
          ? tr("dashboard.usageConversion.yourFullSpeedCallsAreRunningLow")
          : tr("dashboard.usageConversion.youReGettingCloseToYour");
  const body = onTrial
    ? tr("dashboard.usageConversion.thisMonthSFreeCallsRan", { trialEnd, perMinute, resetText })
    : slowLane
      ? overflow?.trialUnavailableReason === "shared_computer"
        ? tr("dashboard.usageConversion.sharedComputerSlowLane", {
            trialDays,
            perMinute,
            resetText,
          })
        : tr("dashboard.usageConversion.callsStillWorkPacedAtA", { perMinute, resetText })
      : ended && overflow
        ? tr("dashboard.usageConversion.yourNextCallStartsAFree", { trialDays })
        : ended
          ? tr("dashboard.usageConversion.newMeteredConnectCallsPauseUntil")
          : after
            ? tr(
                after.next === "trial"
                  ? "dashboard.usageConversion.afterYourFreeCallsATrial"
                  : after.trialUnavailableReason === "shared_computer"
                    ? "dashboard.usageConversion.afterYourFreeCallsSharedComputer"
                    : "dashboard.usageConversion.afterYourFreeCallsTheSlowLane",
                { limit: usage.limit.toLocaleString(), trialDays, perMinute, resetText },
              )
            : tr("dashboard.usageConversion.yourExistingConnectionsStayPairedPlan");
  const status = onTrial
    ? tr("dashboard.usageConversion.ofFullSpeedLeft", {
        daysLeft,
        days: daysLeft === 1 ? "day" : "days",
      })
    : slowLane
      ? tr("dashboard.usageConversion.slowLaneCallsThisMonth", {
          slowLaneCallsThisMonth: overflow!.slowLaneCallsThisMonth.toLocaleString(),
        })
      : ended
        ? tr("dashboard.usageConversion.noFreeCallsRemaining")
        : remaining.toLocaleString() + " " + tr("dashboard.usageConversion.callsRemaining");

  return (
    <section
      ref={sectionRef}
      className={"usageConversion " + (ended && !onTrial ? "usageConversionMax" : "")}
      aria-label={tr("dashboard.usageConversion.monthlyConnectAllowance")}
    >
      <div className="usageConversionCopy">
        <span className="usageConversionKicker">
          <i />
          {kicker}
        </span>
        <h2>{heading}</h2>
        <p>{body}</p>
        <div className="usageConversionActions">
          {overflow || after ? (
            <>
              <a className="usageConversionPrimary" href={checkoutHref}>
                {tr("dashboard.usageConversion.keepFullSpeed")} <span aria-hidden="true">→</span>
              </a>
              <button type="button" className="usageConversionLink" onClick={onManagePlan}>
                {tr("dashboard.usageConversion.viewPlansUsage")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="usageConversionPrimary" onClick={onManagePlan}>
                {tr("dashboard.usageConversion.viewPlansUsage")} <span aria-hidden="true">↗</span>
              </button>
              <a href={pricingUrl}>
                {tr("dashboard.usageConversion.comparePlans")} <span aria-hidden="true">→</span>
              </a>
            </>
          )}
        </div>
      </div>
      <div className="usageConversionPanel">
        <div className="usageConversionPanelTop">
          <span>{tr("dashboard.usageConversion.usedThisMonth")}</span>
          <strong>{Math.round(ratio * 100)}%</strong>
        </div>
        <div className="usageConversionNumbers">
          <strong>{usage.used.toLocaleString()}</strong>
          <span> / {usage.limit.toLocaleString()}</span>
        </div>
        <div
          className="usageConversionTrack"
          role="progressbar"
          aria-label={tr("dashboard.usageConversion.monthlyAllowanceUsed")}
          aria-valuemin={0}
          aria-valuemax={usage.limit}
          aria-valuenow={Math.min(usage.used, usage.limit)}
        >
          <i style={{ width: ratio * 100 + "%" }} />
        </div>
        <div className="usageConversionPanelBottom">
          <span>{status}</span>
          <span>
            {tr("dashboard.usageConversion.resets")} {resetText} UTC
          </span>
        </div>
        {overflow && (
          <p className="usageConversionPace">
            {tr("dashboard.usageConversion.atYourPaceAboutCallsThis", {
              pace: pace.toLocaleString(),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
