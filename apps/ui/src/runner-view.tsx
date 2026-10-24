import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./runner-view.css";

type Attention = {
  id: string;
  device_id: string;
  device_name: string;
  session_id: string;
  kind: string;
  origin: string;
};
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
const viewPath = (row: Attention) =>
  `/dashboard/browser/${encodeURIComponent(row.device_id)}/${encodeURIComponent(row.session_id)}`;
async function requestJSON(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("request_failed");
  return response.json();
}

export function RunnerAttentionList({
  arcSessionId,
  deviceId,
  sessionId,
}: {
  arcSessionId?: string;
  deviceId?: string;
  sessionId?: string;
}) {
  const { tr } = useI18n();
  const [rows, setRows] = useState<Attention[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await requestJSON(
          "/api/runner/attention" +
            (arcSessionId
              ? "?arc_session_id=" + encodeURIComponent(arcSessionId)
              : ""),
        );
        if (!disposed) setRows(data.attention || []);
      } catch {
        /* Leave a previously visible handoff in place during a reconnect. */
      } finally {
        if (!disposed) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [arcSessionId]);
  const visible = rows.filter(
    (row) =>
      (!deviceId || row.device_id === deviceId) &&
      (!sessionId || row.session_id === sessionId),
  );
  async function done(row: Attention) {
    setPending(row.id);
    setNotice("");
    try {
      const result = await requestJSON(
        `/api/runner/attention/${encodeURIComponent(row.id)}/resolve`,
        { method: "POST" },
      );
      if (result.resolved) {
        setRows((current) => current.filter((item) => item.id !== row.id));
        setNotice(
          tr("Checked. Your task can continue.", "已检查，任务可以继续。"),
        );
      } else
        setNotice(
          tr(
            "This step still needs you. Finish it in the browser window, then try again.",
            "页面仍需要你处理。请在电脑的浏览器窗口里完成后重试。",
          ),
        );
    } catch {
      setNotice(
        tr(
          "Could not check the task. Reconnect your computer and try again.",
          "暂时无法检查任务，请恢复电脑连接后重试。",
        ),
      );
    } finally {
      setPending(null);
    }
  }
  if (!visible.length && !notice) return null;
  return (
    <div
      className="runnerAttentionList"
      aria-label={tr("Browser tasks needing you", "需要你处理的浏览器任务")}
    >
      {visible.map((row) => (
        <div className="runnerAttention" key={row.id}>
          <span className="runnerAttentionDot" aria-hidden="true" />
          <div className="runnerAttentionCopy">
            <strong>{new URL(row.origin).hostname}</strong>
            <span>
              {row.kind === "captcha"
                ? tr(
                    "Needs you to complete a verification",
                    "需要你完成人机验证",
                  )
                : row.kind === "otp"
                  ? tr("Needs a verification code", "需要你输入验证码")
                  : row.kind === "scope"
                    ? tr("Needs a site permission", "需要你确认网站权限")
                    : tr("Needs you to sign in", "需要你登录")}{" "}
              · {row.device_name}
            </span>
          </div>
          <div className="runnerAttentionActions">
            {!sessionId && (
              <a href={viewPath(row)}>
                {tr("Open live view", "打开实时画面")} ↗
              </a>
            )}
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void done(row)}
            >
              {pending === row.id
                ? tr("Checking…", "检查中…")
                : tr("I'm done", "我已处理完")}
            </button>
          </div>
        </div>
      ))}
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
      await requestJSON(
        `/api/runner/settings/${encodeURIComponent(deviceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runner_attention_mode: value }),
        },
      );
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
        <span>{tr("When a browser task needs me", "浏览器任务需要我时")}</span>
        <select
          value={mode}
          disabled={saving}
          onChange={(event) => void change(event.target.value)}
        >
          <option value="show_and_notify">
            {tr("Show window and notify", "弹出窗口并通知")}
          </option>
          <option value="notify_only">
            {tr("Notify only", "只通知，不弹窗")}
          </option>
        </select>
      </label>
      {failed && (
        <small role="alert">
          {tr("Could not save. Try again.", "保存失败，请重试。")}
        </small>
      )}
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
  const lastFrame = useRef(0);
  useEffect(() => {
    if (preview) return;
    setFrame("");
    setConnection("connecting");
    let disposed = false;
    const url = new URL(
      `/api/runner/view/${encodeURIComponent(deviceId)}/${encodeURIComponent(sessionId)}`,
      location.origin,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url);
    socket.onopen = () => {
      if (!disposed) setConnection("waiting");
      socket.send(JSON.stringify({ type: "ping" }));
    };
    socket.onmessage = (event) => {
      if (
        disposed ||
        typeof event.data !== "string" ||
        event.data.length > 280000
      )
        return;
      try {
        const value = JSON.parse(event.data);
        if (
          value.type === "runner_frame" &&
          value.session_id === sessionId &&
          typeof value.data === "string" &&
          value.data.length <= 273064 &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
        ) {
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
        if (lastFrame.current && Date.now() - lastFrame.current > 30000)
          setConnection("waiting");
      }
    }, 10000);
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      socket.close();
    };
  }, [deviceId, sessionId, preview, attempt]);
  return (
    <section
      className="runnerScreen"
      aria-label={tr("Task browser live view", "任务浏览器实时画面")}
    >
      <div className="runnerScreenBar">
        <span className={connection === "live" ? "runnerLive" : ""}>
          {preview
            ? tr("Preview · sample browser", "预览 · 示例浏览器")
            : connection === "live"
              ? tr("Live", "实时画面")
              : connection === "disconnected"
                ? tr("Disconnected", "连接已断开")
                : tr("Waiting for screen…", "正在等待画面…")}
        </span>
        <span>{tr("View only", "仅查看")}</span>
      </div>
      {preview ? (
        <div className="runnerSample">
          <div className="runnerSampleForm">
            <span className="runnerSampleBrand">ACME / CAREERS</span>
            <h2>{tr("One last step", "最后一步")}</h2>
            <p>
              {tr(
                "Your application is ready. Complete the verification in the browser window on your computer.",
                "申请已准备好，请在电脑的浏览器窗口里完成验证。",
              )}
            </p>
            <div className="runnerSampleCheck">
              <span aria-hidden="true">○</span>
              {tr("Please verify you are human", "请完成人机验证")}
            </div>
            <small>
              {tr(
                "Your details and upload are saved in this window.",
                "填写的内容和上传的文件仍保留在这个窗口中。",
              )}
            </small>
          </div>
        </div>
      ) : frame ? (
        <img
          src={frame}
          alt={tr("Current task browser screen", "任务浏览器当前画面")}
        />
      ) : (
        <div className="runnerScreenEmpty">
          <p>
            {connection === "disconnected"
              ? tr(
                  "The live view is unavailable. Check that your computer and task browser are running.",
                  "实时画面暂不可用，请确认电脑已连接、任务浏览器仍在运行。",
                )
              : tr(
                  "The task browser will appear here when connected.",
                  "连接成功后，任务浏览器画面会显示在这里。",
                )}
          </p>
          {connection === "disconnected" && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {tr("Reconnect", "重新连接")}
            </button>
          )}
        </div>
      )}
    </section>
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
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const value = await requestJSON(
          `/api/runner/session/${encodeURIComponent(deviceId)}/${encodeURIComponent(sessionId)}`,
        );
        if (!disposed) setStatus(value);
      } catch {
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
          ← {tr("Your computers", "我的电脑")}
        </a>
        <a href="/dashboard" aria-label="Remote Arc">
          <img src="/remote-arc.svg" alt="" width="28" height="28" />
        </a>
      </header>
      <div className="runnerViewIntro">
        <span>{tr("BROWSER TASK", "浏览器任务")}</span>
        <h1>
          {status?.state === "needs_user"
            ? tr("A quick step needs you", "有一步需要你来完成")
            : tr("Your task browser", "任务浏览器")}
        </h1>
        <p>
          {tr(
            "Complete this step in the browser window on your computer. Your AI can continue once it is done.",
            "请在电脑上的浏览器窗口中完成这一步，处理完后 AI 就可以继续。",
          )}
        </p>
      </div>
      <RunnerAttentionList deviceId={deviceId} sessionId={sessionId} />
      <LiveScreen deviceId={deviceId} sessionId={sessionId} preview={preview} />
      <p className="runnerViewFootnote">
        {tr(
          "Live while this page is open. Screen images are not saved. “I'm done” checks the page; it does not submit anything.",
          "仅在此页打开时传输实时画面，不保存画面。“我已处理完”只检查页面，不会提交任何内容。",
        )}
      </p>
      {status?.recent_receipts?.length ? (
        <details className="runnerReceipts">
          <summary>{tr("Recent activity", "最近活动")}</summary>
          <ol>
            {status.recent_receipts.slice(-8).map((receipt, index) => (
              <li key={receipt.seq ?? index}>
                <span>
                  {receipt.action ||
                    receipt.tool.replace("browser_runner_", "")}
                </span>
                <small>{receipt.outcome}</small>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </main>
  );
}
