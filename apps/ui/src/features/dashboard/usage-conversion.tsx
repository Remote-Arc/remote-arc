import React from "react";
import { CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
import type { MonthlyUsage } from "../../types/app-types.js";
import "./usage-conversion.css";

const DAY_MS = 86_400_000;

export function UsageConversionBanner({
  usage,
  onManagePlan,
  pricingUrl,
}: {
  usage: MonthlyUsage | null | undefined;
  onManagePlan: () => void;
  pricingUrl: string;
}) {
  const { tr, locale } = useI18n();
  const overflow = usage?.freeOverflow;
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
    slowLane = Boolean(overflow && trial && !trial.active);
  const trialEnd = trial ? formatDate(new Date(trial.endsAt)) : "";
  const daysLeft = trial
    ? Math.max(0, Math.ceil((Date.parse(trial.endsAt) - Date.now()) / DAY_MS))
    : 0;
  const perMinute = overflow?.slowLaneCallsPerMinute ?? 0,
    trialDays = overflow?.trialDays ?? 0;
  // Their own pace makes "unlimited" concrete: calls so far, projected to the month end.
  const monthStart = Date.UTC(y ?? 2026, (m ?? 1) - 1, 1);
  const elapsedDays = Math.max(1, Math.ceil((Date.now() - monthStart) / DAY_MS));
  const monthDays = Math.round((reset.getTime() - monthStart) / DAY_MS) || 30;
  const pace = Math.round((usage.used / elapsedDays) * monthDays);
  const checkoutHref = "/checkout?product=" + encodeURIComponent(CONNECT_UNLIMITED_PLAN_ID);

  const kicker = onTrial
    ? tr("CONNECT · UNLIMITED TRIAL", "CONNECT · UNLIMITED 试用中")
    : slowLane
      ? tr("CONNECT · SLOW LANE", "CONNECT · 慢速通道")
      : tr("CONNECT · MONTHLY ALLOWANCE", "CONNECT · 本月调用额度");
  const heading = onTrial
    ? daysLeft <= 2
      ? tr(
          `Your full-speed trial ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
          `全速试用还剩 ${daysLeft} 天`,
        )
      : tr(
          `Your agents are on a ${trialDays}-day Connect Unlimited trial`,
          `已为你开启 ${trialDays} 天 Connect Unlimited 试用`,
        )
    : slowLane
      ? tr("Your agents are in the slow lane", "你的 agent 正在慢速通道运行")
      : ended
        ? overflow
          ? tr("Your free calls are used up", "本月免费调用已用完")
          : tr("Your monthly calls are used up", "本月调用额度已用完")
        : tr("You're getting close to your monthly limit", "本月额度即将用完");
  const body = onTrial
    ? tr(
        `This month’s free calls ran out, so your agents keep running at full speed until ${trialEnd}. After that, Free continues in the slow lane at ${perMinute} calls a minute until ${resetText}.`,
        `本月免费调用已用完。为了不打断你的 agent，${trialEnd} 前会保持全速运行；之后 Free 进入慢速通道（每分钟 ${perMinute} 次），直到 ${resetText} 重置。`,
      )
    : slowLane
      ? tr(
          `Calls still work, paced at ${perMinute} a minute until your allowance renews on ${resetText}. Connect Unlimited puts your agents back at full speed.`,
          `调用不会中断，但会限制为每分钟 ${perMinute} 次，直到 ${resetText} 额度重置。Connect Unlimited 可让你的 agent 恢复全速。`,
        )
      : ended && overflow
        ? tr(
            `Your next call starts a free ${trialDays}-day Connect Unlimited trial, so your agents keep running at full speed.`,
            `下一次调用会自动开启 ${trialDays} 天 Connect Unlimited 免费试用，你的 agent 会继续全速运行。`,
          )
        : ended
          ? tr(
              "New metered Connect calls pause until your allowance renews or your plan changes.",
              "新的计量 Connect 调用将暂停，直到月度额度重置或套餐发生变更。",
            )
          : tr(
              "Your existing connections stay paired. Plan ahead so your next workflow isn't interrupted.",
              "现有设备连接保持配对。提前安排额度，避免下次工作流程中断。",
            );
  const status = onTrial
    ? tr(
        `${daysLeft} ${daysLeft === 1 ? "day" : "days"} of full speed left`,
        `全速运行还剩 ${daysLeft} 天`,
      )
    : slowLane
      ? tr(
          `${overflow!.slowLaneCallsThisMonth.toLocaleString()} slow-lane calls this month`,
          `本月慢速通道调用 ${overflow!.slowLaneCallsThisMonth.toLocaleString()} 次`,
        )
      : ended
        ? tr("No free calls remaining", "剩余免费额度为 0")
        : remaining.toLocaleString() + " " + tr("calls remaining", "次剩余额度");

  return (
    <section
      className={"usageConversion " + (ended && !onTrial ? "usageConversionMax" : "")}
      aria-label={tr("Monthly Connect allowance", "每月 Connect 调用额度")}
    >
      <div className="usageConversionCopy">
        <span className="usageConversionKicker">
          <i />
          {kicker}
        </span>
        <h2>{heading}</h2>
        <p>{body}</p>
        <div className="usageConversionActions">
          {overflow ? (
            <>
              <a className="usageConversionPrimary" href={checkoutHref}>
                {tr("Keep full speed", "保持全速")} <span aria-hidden="true">→</span>
              </a>
              <button type="button" className="usageConversionLink" onClick={onManagePlan}>
                {tr("View plans & usage", "查看套餐与用量")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="usageConversionPrimary" onClick={onManagePlan}>
                {tr("View plans & usage", "查看套餐与用量")} <span aria-hidden="true">↗</span>
              </button>
              <a href={pricingUrl}>
                {tr("Compare plans", "比较套餐")} <span aria-hidden="true">→</span>
              </a>
            </>
          )}
        </div>
      </div>
      <div className="usageConversionPanel">
        <div className="usageConversionPanelTop">
          <span>{tr("Used this month", "本月已使用")}</span>
          <strong>{Math.round(ratio * 100)}%</strong>
        </div>
        <div className="usageConversionNumbers">
          <strong>{usage.used.toLocaleString()}</strong>
          <span> / {usage.limit.toLocaleString()}</span>
        </div>
        <div
          className="usageConversionTrack"
          role="progressbar"
          aria-label={tr("Monthly allowance used", "月度额度使用情况")}
          aria-valuemin={0}
          aria-valuemax={usage.limit}
          aria-valuenow={Math.min(usage.used, usage.limit)}
        >
          <i style={{ width: ratio * 100 + "%" }} />
        </div>
        <div className="usageConversionPanelBottom">
          <span>{status}</span>
          <span>
            {tr("Resets", "重置于")} {resetText} UTC
          </span>
        </div>
        {overflow && (
          <p className="usageConversionPace">
            {tr(
              `At your pace: about ${pace.toLocaleString()} calls this month.`,
              `按你现在的速度，本月大约 ${pace.toLocaleString()} 次调用。`,
            )}
          </p>
        )}
      </div>
    </section>
  );
}
