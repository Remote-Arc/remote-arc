import { useEffect, useState } from "react";
import { CenteredCard } from "../../components/public-layout.js";
import { useI18n } from "../../app/i18n.js";
import { normalizeSecret, sealSecret, SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from "./secret-crypto.js";
import "./secret-entry.css";

type Request = {
  handle: string;
  purpose: string;
  site: string | null;
  device: { id: string; name: string; platform: string };
  requested_by: string;
  public_key: string | null;
  status: string;
  expires_at: string;
};

// The page an AI sends the user to when a task needs a secret. The value is
// encrypted here, to a key on the user's own device, and never reaches the AI.
export function SecretEntry({ handle }: { handle: string }) {
  const { tr } = useI18n();
  const [request, setRequest] = useState<Request | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/secret-requests/" + encodeURIComponent(handle), { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as Request) : null))
      .catch(() => null)
      .then((payload) => { if (!cancelled) setRequest(payload); });
    return () => { cancelled = true; };
  }, [handle]);

  if (request === undefined) return <CenteredCard title={tr("Loading request…", "正在读取请求…")} body="" />;
  if (request === null) {
    return <CenteredCard title={tr("Request not found", "找不到这个请求")} body={tr("This link is not for the account you are signed in to, or it does not exist. Ask your AI to request the secret again.", "这个链接不属于你当前登录的账号，或者不存在。请让 AI 重新发起请求。")} />;
  }
  if (done || request.status === "delivered" || request.status === "used") {
    return <CenteredCard title={tr("Sent to your device", "已发送到你的设备")} body={tr("The secret is on " + request.device.name + ", encrypted end to end. Go back to your AI and tell it you have entered it. It can be used once, within 10 minutes.", "密钥已端到端加密发送到 " + request.device.name + "。回到 AI 对话里告诉它你已经填好了。它只能使用一次，10 分钟内有效。")} />;
  }
  if (request.status !== "pending" || !request.public_key) {
    return <CenteredCard title={tr("This request has expired", "这个请求已过期")} body={tr("Requests last 10 minutes. Ask your AI to request the secret again.", "请求只在 10 分钟内有效。请让 AI 重新发起请求。")} />;
  }

  const normalized = normalizeSecret(value);
  const valid = normalized.length >= SECRET_MIN_LENGTH && normalized.length <= SECRET_MAX_LENGTH;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !request?.public_key) return;
    setBusy(true);
    setError("");
    try {
      const sealed = await sealSecret(request.public_key, request.handle, normalized);
      const response = await fetch("/api/secret-requests/" + encodeURIComponent(request.handle), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sealed),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error === "device_offline"
          ? tr(request.device.name + " is offline. Turn it on and ask your AI to request the secret again.", request.device.name + " 不在线。请打开它，再让 AI 重新发起请求。")
          : payload.error === "expired"
            ? tr("This request has expired. Ask your AI to request the secret again.", "这个请求已过期，请让 AI 重新发起请求。")
            : tr("Your device could not take the secret. Ask your AI to request it again.", "设备没有接收这个密钥，请让 AI 重新发起请求。"));
        return;
      }
      setValue("");
      setDone(true);
    } catch {
      setError(tr("The secret could not be encrypted in this browser. Try another browser.", "这个浏览器无法加密密钥，请换一个浏览器再试。"));
    } finally {
      setBusy(false);
    }
  }

  const where = request.site
    ? tr("It will be filled once on " + request.site + " in your browser " + request.device.name + ".", "它只会在浏览器 " + request.device.name + " 的 " + request.site + " 上填写一次。")
    : tr("It will be given once to a command on " + request.device.name + ".", "它只会在 " + request.device.name + " 上交给一条命令使用一次。");
  return (
    <CenteredCard title={tr("Enter a secret for your AI", "为 AI 填写密钥")} body={tr(request.requested_by + " asked for this. Your AI will not see the value.", request.requested_by + " 发起了这个请求。AI 看不到你填写的内容。")}>
      <form className="secretEntry" onSubmit={(event) => void submit(event)}>
        <dl className="secretEntryFacts">
          <dt>{tr("For", "用途")}</dt><dd>{request.purpose}</dd>
          <dt>{tr("Goes to", "发送到")}</dt><dd>{where}</dd>
          <dt>{tr("Expires", "有效期至")}</dt><dd>{new Date(request.expires_at).toLocaleTimeString()}</dd>
        </dl>
        <label className="secretEntryField">
          <span>{tr("Secret", "密钥")}</span>
          <span className="secretEntryInput">
            <input type={shown ? "text" : "password"} value={value} onChange={(event) => setValue(event.target.value)}
              autoComplete="off" spellCheck={false} autoFocus maxLength={SECRET_MAX_LENGTH + 64} aria-describedby="secret-entry-note" />
            <button type="button" className="ghostButton small" onClick={() => setShown(!shown)} aria-pressed={shown}>{shown ? tr("Hide", "隐藏") : tr("Show", "显示")}</button>
          </span>
        </label>
        <p id="secret-entry-note" className="secretEntryNote">{tr("Encrypted in this browser to a key on your device. Remote Arc passes it on without being able to read it, and keeps no copy.", "在这个浏览器里用你设备上的密钥加密。Remote Arc 只负责转发，读不到内容，也不保存副本。")}</p>
        {error && <p className="secretEntryError" role="alert">{error}</p>}
        <button className="primaryButton" type="submit" disabled={!valid || busy}>{busy ? tr("Sending…", "正在发送…") : tr("Send to my device", "发送到我的设备")}</button>
      </form>
    </CenteredCard>
  );
}
