import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import "../../styles/apps/slack-bot-panel.css";

type Link = {
  team_id: string;
  slack_user_id: string;
  team_name: string | null;
  app_id: string | null;
  installation_status: string | null;
};
type Installation = { team_id: string; team_name: string; app_id: string; status: string };
type State = {
  configured: boolean;
  links: Link[];
  installations?: Installation[];
  modelId?: string;
  models?: { id: string; label: string }[];
  canSelectModel?: boolean;
};
export function SlackBotPanel() {
  const { tr } = useI18n(),
    [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/slack/status", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const value = await response.json().then(canonicalErrorEnvelope);
        if (typeof value.configured !== "boolean" || !Array.isArray(value.links)) throw Error();
        setState(value);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(tr("apps.slackBotPanel.couldNotLoadSlackBotSettings"));
      });
    return () => controller.abort();
  }, [revision, tr]);
  async function install() {
    if (UI_PREVIEW || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/slack/install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
        body = await response.json().then(canonicalErrorEnvelope);
      if (!response.ok) throw Error();
      const url = new URL(body.authorizationUrl);
      if (url.origin !== "https://slack.com" || url.pathname !== "/oauth/v2/authorize")
        throw Error();
      location.assign(url.href);
    } catch {
      setError(tr("apps.slackBotPanel.slackBotInstallationCouldNotStart"));
      setBusy(false);
    }
  }
  async function unlink(link: Link) {
    if (UI_PREVIEW || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/slack/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamId: link.team_id, slackUserId: link.slack_user_id }),
      });
      if (!response.ok) throw Error();
      setRevision((value) => value + 1);
    } catch {
      setError(tr("apps.slackBotPanel.couldNotDisconnectThisSlackIdentity"));
    } finally {
      setBusy(false);
    }
  }
  async function changeModel(modelId: string) {
    if (UI_PREVIEW || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/slack/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (!response.ok) throw Error();
      setRevision((value) => value + 1);
    } catch {
      setError(tr("apps.slackBotPanel.couldNotChangeTheSlackModel"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="slackBotPanel" aria-label={tr("apps.slackBotPanel.remoteArcBotInSlack")}>
      <header>
        <div>
          <h3>{tr("apps.slackBotPanel.chatWithRemoteArcInSlack")}</h3>
          <p>{tr("apps.slackBotPanel.usesYourArcPlanCreditsAnd")}</p>
        </div>
        <button
          className="appsManagerRefresh"
          type="button"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          {tr("apps.slackBotPanel.refresh")}
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">{tr("apps.slackBotPanel.loading")}</p>}
      {state && (
        <>
          <label className="slackBotModel">
            {tr("apps.slackBotPanel.modelForSlackConversations")}
            <select
              value={state.modelId || "auto"}
              disabled={busy || UI_PREVIEW || !state.canSelectModel}
              onChange={(event) => void changeModel(event.target.value)}
            >
              {(state.models || [{ id: "auto", label: "Auto" }]).map((model) => (
                <option value={model.id} key={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <small>
              {state.canSelectModel
                ? tr("apps.slackBotPanel.appliesToNewSlackRequests")
                : tr("apps.slackBotPanel.freeTrialUsesAutoPlusAnd")}
            </small>
          </label>
          <div className="slackBotLinks">
            {state.links.map((link) => (
              <article key={link.team_id + ":" + link.slack_user_id}>
                <div>
                  <strong>{link.team_name || link.team_id}</strong>
                  <small>
                    {link.slack_user_id} ·{" "}
                    {link.installation_status === "active"
                      ? tr("apps.slackBotPanel.linked")
                      : tr("apps.slackBotPanel.reinstallRequired")}
                  </small>
                </div>
                <div>
                  {link.app_id && link.installation_status === "active" && (
                    <a
                      href={
                        "https://slack.com/app_redirect?team=" +
                        encodeURIComponent(link.team_id) +
                        "&app=" +
                        encodeURIComponent(link.app_id)
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("apps.slackBotPanel.openChat")} ↗
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busy || UI_PREVIEW}
                    onClick={() => void unlink(link)}
                  >
                    {tr("apps.slackBotPanel.disconnectIdentity")}
                  </button>
                </div>
              </article>
            ))}
            {(state.installations || [])
              .filter(
                (installation) =>
                  !state.links.some((link) => link.team_id === installation.team_id),
              )
              .map((installation) => (
                <article key={installation.team_id}>
                  <div>
                    <strong>{installation.team_name}</strong>
                    <small>{tr("apps.slackBotPanel.installedSendAMessageToLink")}</small>
                  </div>
                  <a
                    href={
                      "https://slack.com/app_redirect?team=" +
                      encodeURIComponent(installation.team_id) +
                      "&app=" +
                      encodeURIComponent(installation.app_id)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("apps.slackBotPanel.openChat")} ↗
                  </a>
                </article>
              ))}
          </div>
          {!state.links.length && <p>{tr("apps.slackBotPanel.installTheBotOpenRemoteArc")}</p>}
          <button
            type="button"
            className="appsManagerPrimary"
            disabled={busy || UI_PREVIEW || !state.configured}
            onClick={() => void install()}
          >
            {tr("apps.slackBotPanel.addRemoteArcBotToSlack")}
          </button>
          {!state.configured && (
            <small>{tr("apps.slackBotPanel.slackBotSetupIsNotComplete")}</small>
          )}
        </>
      )}
    </section>
  );
}
