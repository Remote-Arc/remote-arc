import { useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import {
  useNotificationSettings,
  type NotificationChannel,
  type NotificationChannelKind,
  type NotificationEvent,
} from "../../hooks/settings/use-notification-settings.js";
import { NotificationUpgrade } from "./notification-upgrade.js";
import "../../styles/settings/notification-settings.css";

const CHANNEL_TEXT = {
  slack: {
    title: "settings.notificationSettings.slackTitle",
    detail: "settings.notificationSettings.slackDetail",
  },
  webhook: {
    title: "settings.notificationSettings.webhookTitle",
    detail: "settings.notificationSettings.webhookDetail",
  },
} as const;

const EVENT_TEXT = {
  decision_needed: "settings.notificationSettings.eventDecisionNeeded",
  repair_succeeded: "settings.notificationSettings.eventRepairSucceeded",
  run_failed: "settings.notificationSettings.eventRunFailed",
  notify: "settings.notificationSettings.eventNotify",
} as const satisfies Record<NotificationEvent, string>;

const UNAVAILABLE_TEXT = {
  SLACK_NOT_CONFIGURED: "settings.notificationSettings.unavailableSlack",
  SLACK_NOT_LINKED: "settings.notificationSettings.slackNotLinked",
  WEBHOOK_NOT_CONFIGURED: "settings.notificationSettings.unavailableWebhook",
  PLAN_UPGRADE_REQUIRED: "settings.notificationSettings.unavailablePlan",
} as const;
const unavailableText = (code: string | null | undefined) =>
  code && code in UNAVAILABLE_TEXT ? UNAVAILABLE_TEXT[code as keyof typeof UNAVAILABLE_TEXT] : null;

type Model = ReturnType<typeof useNotificationSettings>;

function ChannelCard({ channel, model }: { channel: NotificationChannel; model: Model }) {
  const { tr } = useI18n();
  const [url, setUrl] = useState(channel.url || "");
  const kind: NotificationChannelKind = channel.kind;
  const text = CHANNEL_TEXT[kind];
  const busy = model.busy === kind;
  const failure = model.failureFor(kind);
  const blocked = Boolean(channel.unavailable) && !channel.enabled;
  // A plan-locked channel says so where its controls are, not only in the banner.
  const proOnly = blocked && channel.unavailable === "PLAN_UPGRADE_REQUIRED";
  const toggleEvent = (event: NotificationEvent, on: boolean) =>
    model.save(kind, {
      events: on ? [...channel.events, event] : channel.events.filter((item) => item !== event),
    });

  return (
    <section
      className="raSettingsSurface notificationChannel"
      aria-labelledby={"notify-" + kind}
      data-channel={kind}
    >
      <div className="raSettingsRow raSettingsRowLast">
        <div className="raSettingsRowInfo">
          <div className="notificationChannelTitle">
            <h4 id={"notify-" + kind}>{tr(text.title)}</h4>
            {proOnly && (
              <span
                className="notificationUpgradeBadge"
                title={tr("settings.notificationSettings.unavailablePlan")}
              >
                Pro
              </span>
            )}
          </div>
          <p>{tr(text.detail)}</p>
          {channel.unavailable && (
            <p className="notificationUnavailable">
              {tr(
                unavailableText(channel.unavailable) || "settings.notificationSettings.unavailable",
              )}
            </p>
          )}
        </div>
        <div className="raSettingsRowControl">
          <button
            type="button"
            role="switch"
            className="raSwitch"
            aria-checked={channel.enabled}
            aria-labelledby={"notify-" + kind}
            title={
              proOnly
                ? tr("settings.notificationSettings.unavailablePlan")
                : channel.enabled
                  ? tr("settings.notificationSettings.on")
                  : tr("settings.notificationSettings.off")
            }
            disabled={busy || blocked || (kind === "webhook" && !channel.enabled && !url.trim())}
            onClick={() =>
              model.save(kind, {
                enabled: !channel.enabled,
                ...(kind === "webhook" && !channel.enabled ? { url: url.trim() } : {}),
              })
            }
          />
        </div>
      </div>

      {kind === "webhook" && (
        <form
          className="notificationWebhook"
          onSubmit={(event) => {
            event.preventDefault();
            void model.save(kind, { url: url.trim() });
          }}
        >
          <label htmlFor="notify-webhook-url">
            {tr("settings.notificationSettings.webhookUrl")}
          </label>
          <div>
            <input
              id="notify-webhook-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              disabled={busy || blocked}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button
              type="submit"
              className="raSettingsButton"
              disabled={busy || blocked || !url.trim() || url.trim() === channel.url}
            >
              {tr("settings.notificationSettings.saveUrl")}
            </button>
          </div>
          {model.secret && (
            <div className="notificationSecret" role="status">
              <p>{tr("settings.notificationSettings.secretOnce")}</p>
              <code>{model.secret}</code>
              <button type="button" className="raSettingsButton" onClick={model.dismissSecret}>
                {tr("settings.notificationSettings.secretSaved")}
              </button>
            </div>
          )}
        </form>
      )}

      {channel.enabled && (
        <>
          <fieldset className="notificationEvents" disabled={busy}>
            <legend>{tr("settings.notificationSettings.sendWhen")}</legend>
            {(Object.keys(EVENT_TEXT) as NotificationEvent[]).map((event) => (
              <label key={event}>
                <input
                  type="checkbox"
                  className="raCheckbox"
                  checked={channel.events.includes(event)}
                  onChange={(change) => toggleEvent(event, change.target.checked)}
                />
                <span>{tr(EVENT_TEXT[event])}</span>
              </label>
            ))}
          </fieldset>
          <div className="notificationFooter">
            <button
              type="button"
              className="raSettingsButton"
              disabled={busy}
              onClick={() => model.sendTest(kind)}
            >
              {tr("settings.notificationSettings.sendTest")}
            </button>
            <span>
              {model.testedFor(kind)
                ? tr(
                    model.testedFor(kind)!.sent
                      ? "settings.notificationSettings.testSent"
                      : "settings.notificationSettings.testQueued",
                  )
                : channel.last_error
                  ? tr("settings.notificationSettings.lastError", { code: channel.last_error })
                  : channel.last_delivery_at
                    ? tr("settings.notificationSettings.lastDelivered", {
                        time: new Date(channel.last_delivery_at).toLocaleString(),
                      })
                    : ""}
            </span>
          </div>
        </>
      )}
      {failure && (
        <p className="raSettingsInlineError" role="alert">
          {unavailableText(failure.code) ? tr(unavailableText(failure.code)!) : failure.message}
        </p>
      )}
    </section>
  );
}

/** Settings → Notifications: where routine decisions, repairs and notify steps are sent. */
export function NotificationSettings() {
  const { tr } = useI18n();
  const model = useNotificationSettings();
  if (model.loadFailed)
    return (
      <p className="raSettingsInlineError" role="alert">
        {tr("settings.notificationSettings.loadFailed")}{" "}
        <button type="button" className="raSettingsButton" onClick={() => void model.reload()}>
          {tr("settings.notificationSettings.retry")}
        </button>
      </p>
    );
  if (!model.settings) return <p>{tr("settings.notificationSettings.loading")}</p>;
  return (
    <div className="raSettingsSections">
      {model.settings.channels.some(
        (channel) => channel.unavailable === "PLAN_UPGRADE_REQUIRED",
      ) && <NotificationUpgrade />}
      {model.settings.channels.map((channel) => (
        <ChannelCard key={channel.kind} channel={channel} model={model} />
      ))}
      <p className="raSettingsFootnote">{tr("settings.notificationSettings.footnote")}</p>
    </div>
  );
}
