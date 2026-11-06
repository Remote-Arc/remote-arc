import { useRunnerAttention, type Attention } from "../../hooks/use-runner-attention.js";
import { requestJSON, RunnerRequestError } from "./runner-requests.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/browser-runner/runner-view.css";
import { RunnerVideoPlayer } from "./runner-video.js";

type Status = {
  state?: string;
  needs_user?: string;
  browser_running?: boolean;
  recent_receipts?: {
    seq: number;
    action?: string;
    tool: string;
    outcome: string;
    at: string;
  }[];
};
const viewPath = (row: Pick<Attention, "device_id" | "session_id">) =>
  `/dashboard/browser/${encodeURIComponent(row.device_id)}/${encodeURIComponent(row.session_id)}`;
export function RunnerAttentionList({
  arcSessionId,
  deviceId,
  sessionId,
}: {
  arcSessionId?: string;
  deviceId?: string;
  sessionId?: string;
}) {
  const { rows, remove } = useRunnerAttention({ arcSessionId });
  const visible = (rows ?? []).filter(
    (row) =>
      (!deviceId || row.device_id === deviceId) && (!sessionId || row.session_id === sessionId),
  );
  return <RunnerAttentionRows rows={visible} remove={remove} showLiveView={!sessionId} />;
}

export function RunnerAttentionInbox({
  attention,
}: {
  attention: ReturnType<typeof useRunnerAttention>;
}) {
  const { tr } = useI18n();
  const { rows, failed, hideUnavailable, remove } = attention;
  return (
    <section className="runnerAttentionInbox" aria-labelledby="runner-attention-heading">
      <h3 id="runner-attention-heading">{tr("browserRunner.runnerView.browserTasks")}</h3>
      {failed && (
        <p className="runnerNotice" role="status">
          {tr("browserRunner.runnerView.couldNotRefreshBrowserTasks")}
        </p>
      )}
      {!failed && !rows?.length && (
        <p className="runnerNotice">
          {rows
            ? tr("browserRunner.runnerView.noBrowserTasksNeedYourAttention")
            : tr("browserRunner.runnerView.loadingBrowserTasks")}
        </p>
      )}
      <RunnerAttentionRows
        rows={rows ?? []}
        remove={remove}
        showLiveView
        hideUnavailable={hideUnavailable}
      />
    </section>
  );
}

function RunnerAttentionRows({
  rows,
  remove,
  showLiveView,
  hideUnavailable,
}: {
  rows: Attention[];
  remove: (id: string) => void;
  showLiveView: boolean;
  hideUnavailable?: (id: string) => void;
}) {
  const { tr } = useI18n();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function done(row: Attention) {
    setPending(row.id);
    setNotice("");
    try {
      const result = await requestJSON(
        `/api/runner/attention/${encodeURIComponent(row.id)}/resolve`,
        { method: "POST" },
      );
      if (result.resolved) {
        remove(row.id);
        setNotice(
          result.state === "not_running"
            ? tr("browserRunner.runnerView.thisTaskBrowserIsClosedIts")
            : result.state === "not_needed" || result.state === "already_resolved"
              ? tr("browserRunner.runnerView.thisStepNoLongerNeedsYour")
              : tr("browserRunner.runnerView.checkedYourTaskCanContinue"),
        );
      } else setNotice(tr("browserRunner.runnerView.thisStepStillNeedsYouFinish"));
    } catch {
      setNotice(tr("browserRunner.runnerView.couldNotCheckThisTaskCheck"));
    } finally {
      setPending(null);
    }
  }
  if (!rows.length && !notice) return null;
  const waiting = hideUnavailable ? rows.filter((row) => row.availability === "unavailable") : [];
  const active = hideUnavailable ? rows.filter((row) => row.availability !== "unavailable") : rows;
  const renderRow = (row: Attention) => (
    <div className="runnerAttention" key={row.id}>
      <span className="runnerAttentionDot" aria-hidden="true" />
      <div className="runnerAttentionCopy">
        <strong>{new URL(row.origin).hostname}</strong>
        <span>
          {row.kind === "captcha"
            ? tr("browserRunner.runnerView.needsYouToCompleteAVerification")
            : row.kind === "otp"
              ? tr("browserRunner.runnerView.needsAVerificationCode")
              : row.kind === "scope"
                ? tr("browserRunner.runnerView.needsASitePermission")
                : tr("browserRunner.runnerView.needsYouToSignIn")}{" "}
          · {row.device_name}
        </span>
        {row.availability === "unavailable" && (
          <small role="status">
            {tr("browserRunner.runnerView.waitingForTheComputerToReconnect")}
          </small>
        )}
      </div>
      {row.availability !== "unavailable" ? (
        <div className="runnerAttentionActions">
          {showLiveView && (
            <a href={viewPath(row)}>{tr("browserRunner.runnerView.openLiveView")} ↗</a>
          )}
          <button type="button" disabled={pending !== null} onClick={() => void done(row)}>
            {pending === row.id
              ? tr("browserRunner.runnerView.checking")
              : tr("browserRunner.runnerView.iMDone")}
          </button>
        </div>
      ) : (
        hideUnavailable && (
          <div className="runnerAttentionActions">
            <button type="button" onClick={() => hideUnavailable(row.id)}>
              {tr("browserRunner.runnerView.hideReminder")}
            </button>
          </div>
        )
      )}
    </div>
  );
  return (
    <div
      className="runnerAttentionList"
      aria-label={tr("browserRunner.runnerView.browserTasksNeedingYou")}
    >
      {active.map(renderRow)}
      {waiting.length > 0 && (
        <details className="runnerAttentionWaiting">
          <summary>
            {tr("browserRunner.runnerView.waitingForAccess")} · {waiting.length}
          </summary>
          {waiting.map(renderRow)}
        </details>
      )}
      {notice && (
        <p className="runnerNotice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

export function RunnerAttentionSetting({ deviceId }: { deviceId: string }) {
  const { tr } = useI18n();
  const [mode, setMode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void requestJSON(`/api/runner/settings/${encodeURIComponent(deviceId)}`)
      .then((value) => {
        if (active) setMode(value.runner_attention_mode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [deviceId]);
  if (mode === null) return null;
  async function change(value: string) {
    setSaving(true);
    setFailed(false);
    try {
      await requestJSON(`/api/runner/settings/${encodeURIComponent(deviceId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runner_attention_mode: value }),
      });
      setMode(value);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="runnerSetting">
      <label>
        <span>{tr("browserRunner.runnerView.whenABrowserTaskNeedsMe")}</span>
        <select
          value={mode}
          disabled={saving}
          onChange={(event) => void change(event.target.value)}
        >
          <option value="show_and_notify">
            {tr("browserRunner.runnerView.showWindowAndNotify")}
          </option>
          <option value="notify_only">{tr("browserRunner.runnerView.notifyOnly")}</option>
        </select>
      </label>
      {failed && <small role="alert">{tr("browserRunner.runnerView.couldNotSaveTryAgain")}</small>}
    </div>
  );
}

function LiveScreen({
  deviceId,
  sessionId,
  preview,
}: {
  deviceId: string;
  sessionId: string;
  preview: boolean;
}) {
  const { tr } = useI18n();
  const [frame, setFrame] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [attempt, setAttempt] = useState(0);
  const [videoLive, setVideoLive] = useState(false);
  const videoElement = useRef<HTMLVideoElement>(null);
  const lastFrame = useRef(0);
  useEffect(() => {
    if (preview) return;
    setFrame("");
    setVideoLive(false);
    setConnection("connecting");
    let disposed = false;
    const url = new URL(
      `/api/runner/view/${encodeURIComponent(deviceId)}/${encodeURIComponent(sessionId)}`,
      location.origin,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    let video: RunnerVideoPlayer | undefined;
    socket.onopen = () => {
      if (!disposed) setConnection("waiting");
      socket.send(JSON.stringify({ type: "ping" }));
      if (videoElement.current) {
        video = new RunnerVideoPlayer(
          socket,
          videoElement.current,
          () => {
            if (!disposed) {
              setVideoLive(true);
              setFrame("");
              setConnection("live");
            }
          },
          () => {
            if (!disposed) setVideoLive(false);
          },
        );
        video.start();
      }
    };
    socket.onmessage = (event) => {
      if (disposed || typeof event.data !== "string" || event.data.length > 280000) return;
      try {
        const value = JSON.parse(event.data);
        if (value.type === "runner_video") {
          void video?.signal(value);
          return;
        }
        if (
          value.type === "runner_frame" &&
          value.session_id === sessionId &&
          typeof value.data === "string" &&
          value.data.length <= 273064 &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
        ) {
          if (video?.playing) return;
          lastFrame.current = Date.now();
          setFrame("data:image/jpeg;base64," + value.data);
          setConnection("live");
        }
      } catch {
        /* Ignore malformed messages. */
      }
    };
    socket.onclose = () => {
      if (!disposed) {
        video?.close();
        setVideoLive(false);
        setConnection("disconnected");
        setFrame("");
      }
    };
    socket.onerror = () => {
      if (!disposed) setConnection("disconnected");
    };
    const heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
        if (!video?.playing && lastFrame.current && Date.now() - lastFrame.current > 30000)
          setConnection("waiting");
      }
    }, 10000);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      video?.close();
      socket.close();
    };
  }, [deviceId, sessionId, preview, attempt]);
  return (
    <section
      className="runnerScreen"
      aria-label={tr("browserRunner.runnerView.taskBrowserLiveView")}
    >
      <div className="runnerScreenBar">
        <span className={connection === "live" ? "runnerLive" : ""}>
          {preview
            ? tr("browserRunner.runnerView.previewSampleBrowser")
            : connection === "live"
              ? tr("browserRunner.runnerView.live")
              : connection === "disconnected"
                ? tr("browserRunner.runnerView.disconnected")
                : tr("browserRunner.runnerView.waitingForScreen")}
        </span>
        <span>{tr("browserRunner.runnerView.viewOnly")}</span>
      </div>
      {!preview && (
        <video
          ref={videoElement}
          autoPlay
          muted
          playsInline
          hidden={!videoLive}
          aria-label={tr("browserRunner.runnerView.currentTaskBrowserScreen")}
        />
      )}
      {preview ? (
        <div className="runnerSample">
          <div className="runnerSampleForm">
            <span className="runnerSampleBrand">ACME / CAREERS</span>
            <h2>{tr("browserRunner.runnerView.oneLastStep")}</h2>
            <p>{tr("browserRunner.runnerView.yourApplicationIsReadyCompleteThe")}</p>
            <div className="runnerSampleCheck">
              <span aria-hidden="true">○</span>
              {tr("browserRunner.runnerView.pleaseVerifyYouAreHuman")}
            </div>
            <small>{tr("browserRunner.runnerView.yourDetailsAndUploadAreSaved")}</small>
          </div>
        </div>
      ) : videoLive ? null : frame ? (
        <img src={frame} alt={tr("browserRunner.runnerView.currentTaskBrowserScreen")} />
      ) : (
        <div className="runnerScreenEmpty">
          <p>
            {connection === "disconnected"
              ? tr("browserRunner.runnerView.theLiveViewIsUnavailableCheck")
              : tr("browserRunner.runnerView.theTaskBrowserWillAppearHere")}
          </p>
          {connection === "disconnected" && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              {tr("browserRunner.runnerView.reconnect")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// Device-level session discovery is intentionally independent of handoff alerts.
// The live stream starts only after the owner explicitly opens a task.
export function DeviceBrowserSessions({ deviceId }: { deviceId: string }) {
  const { tr } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<
    { session_id: string; hostname: string; state: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      setLoading(true);
      try {
        const data = await requestJSON(`/api/runner/sessions/${encodeURIComponent(deviceId)}`);
        if (!stopped) {
          setSessions(Array.isArray(data.sessions) ? data.sessions : []);
          setError(false);
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(refresh, 10000);
        }
      }
    }
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deviceId, expanded]);
  return (
    <details
      className="deviceBrowserSessions"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span>{tr("browserRunner.runnerView.browserLiveView")}</span>
        <span>{tr("browserRunner.runnerView.viewRunningTasks")}</span>
      </summary>
      <div className="deviceBrowserSessionList" aria-live="polite">
        {error ? (
          <p role="status">{tr("browserRunner.runnerView.couldNotLoadBrowserSessionsCheck")}</p>
        ) : sessions.length ? (
          sessions.map((session) => (
            <a
              key={session.session_id}
              href={viewPath({ device_id: deviceId, session_id: session.session_id })}
              title={session.session_id}
            >
              <span>
                <strong>{session.hostname || tr("browserRunner.runnerView.taskBrowser")}</strong>
                <small>
                  {session.state === "needs_user"
                    ? tr("browserRunner.runnerView.needsAttention")
                    : tr("browserRunner.runnerView.running")}
                </small>
              </span>
              <span>{tr("browserRunner.runnerView.watch")} ↗</span>
            </a>
          ))
        ) : (
          <p>
            {loading
              ? tr("browserRunner.runnerView.findingRunningBrowsers")
              : tr("browserRunner.runnerView.noRunningBrowserTasksOnThis")}
          </p>
        )}
      </div>
    </details>
  );
}

export function RunnerView({
  deviceId,
  sessionId,
  preview = false,
}: {
  deviceId: string;
  sessionId: string;
  preview?: boolean;
}) {
  const { tr } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    setStatus(null);
    setUnavailable(false);
    const load = async () => {
      try {
        const value = await requestJSON(
          `/api/runner/session/${encodeURIComponent(deviceId)}/${encodeURIComponent(sessionId)}`,
        );
        if (!disposed) {
          setStatus(value);
          setUnavailable(false);
        }
      } catch (error) {
        if (!disposed) {
          if (error instanceof RunnerRequestError && error.code === "SESSION_NOT_FOUND") {
            setStatus({ state: "closed", browser_running: false });
            setUnavailable(false);
          } else {
            setUnavailable(true);
          }
        }
      } finally {
        if (!disposed) timer = setTimeout(load, 10000);
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [deviceId, sessionId]);
  return (
    <main className="runnerView">
      <header className="runnerViewHeader">
        <a className="runnerBack" href="/devices">
          ← {tr("browserRunner.runnerView.yourComputers")}
        </a>
        <a href="/dashboard" aria-label="Remote Arc">
          <img src="/remote-arc.svg" alt="" width="28" height="28" />
        </a>
      </header>
      <div className="runnerViewIntro">
        <span>{tr("browserRunner.runnerView.browserTask")}</span>
        <h1>
          {status?.browser_running === false
            ? tr("browserRunner.runnerView.thisTaskBrowserIsClosed")
            : status?.state === "needs_user"
              ? tr("browserRunner.runnerView.aQuickStepNeedsYou")
              : tr("browserRunner.runnerView.yourTaskBrowser")}
        </h1>
        <p>
          {status?.browser_running === false
            ? tr("browserRunner.runnerView.thereIsNoLiveScreenFor")
            : tr("browserRunner.runnerView.completeThisStepInTheBrowser")}
        </p>
      </div>
      {!unavailable &&
      status?.browser_running !== false &&
      (preview || status?.browser_running === true) ? (
        <>
          <RunnerAttentionList deviceId={deviceId} sessionId={sessionId} />
          <LiveScreen deviceId={deviceId} sessionId={sessionId} preview={preview} />
        </>
      ) : (
        <p className="runnerNotice" role="status">
          {status?.browser_running === false
            ? tr("browserRunner.runnerView.noRunningBrowserTaskToView")
            : unavailable
              ? tr("browserRunner.runnerView.couldNotLoadThisTaskCheck")
              : tr("browserRunner.runnerView.checkingTaskStatus")}
        </p>
      )}
      <p className="runnerViewFootnote">{tr("browserRunner.runnerView.liveWhileThisPageIsOpen")}</p>
      {status?.recent_receipts?.length ? (
        <details className="runnerReceipts">
          <summary>{tr("browserRunner.runnerView.recentActivity")}</summary>
          <ol>
            {status.recent_receipts.slice(-8).map((receipt, index) => (
              <li key={receipt.seq ?? index}>
                <span>{receipt.action || receipt.tool.replace("browser_runner_", "")}</span>
                <small>{receipt.outcome}</small>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </main>
  );
}
