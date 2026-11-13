import type { Translate } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import type { ArcAppConnectionRequest } from "@remotearc/protocol";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { AppCredentialForm, type AppCredentialInput } from "../../apps/apps-auth-form.js";
import { UI_PREVIEW } from "../../../preview/preview-mode.js";
import "../../../styles/arc/chat/arc-app-connection-card.css";
import { GoogleDataNotice } from "../../apps/google-app-beta.js";

type Tr = Translate;
async function appsRequest(path: string, body: unknown) {
  const response = await fetch("/api/apps/" + path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().then(canonicalErrorEnvelope);
  if (!response.ok) throw Error("CONNECTION_UNAVAILABLE");
  return result;
}
export function ArcAppConnectionCard({
  request,
  tr,
  onChanged,
}: {
  request: ArcAppConnectionRequest;
  tr: Tr;
  onChanged: () => Promise<void>;
}) {
  const [current, setCurrent] = useState(request),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(() =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("connection") === "retry"
        ? tr("arc.chat.arcAppConnectionCard.connectionWasNotCompletedYouCan")
        : "",
    ),
    [credentials, setCredentials] = useState(false),
    [shop, setShop] = useState("");
  const live = useRef(true),
    lock = useRef(false);
  const [dataAccepted, setDataAccepted] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    setCurrent(request);
  }, [
    request.id,
    request.status,
    request.configured,
    request.requiresBetaApproval,
    request.dataPolicy?.version,
  ]);
  useEffect(() => {
    setDataAccepted(false);
  }, [request.id, request.dataPolicy?.version]);
  async function resume(connectionId: string) {
    await arcRequest("app-connections/" + current.id, {
      method: "POST",
      body: JSON.stringify({ action: "resume", connectionId }),
    });
    if (live.current) {
      setCurrent((value) => ({ ...value, status: "resumed" }));
      await onChanged();
    }
  }
  async function connect() {
    if (
      lock.current ||
      !["pending", "expired"].includes(current.status) ||
      !current.configured ||
      current.requiresBetaApproval ||
      (current.dataPolicy && !dataAccepted)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (current.status === "expired") {
        const value = await arcRequest<{ request: ArcAppConnectionRequest }>(
          "app-connections/" + current.id,
          { method: "POST", body: JSON.stringify({ action: "renew" }) },
        );
        if (live.current) setCurrent(value.request);
      }
      if (UI_PREVIEW) {
        await resume("preview-" + current.provider);
        return;
      }
      if (current.auth === "api_key") {
        setCredentials(true);
        return;
      }
      const result = await appsRequest("authorize", {
        provider: current.provider,
        permissions: current.permissions || ["read", "write"],
        chatRequestId: current.id,
        ...(current.dataPolicy ? { dataConsent: current.dataPolicy.version } : {}),
        ...(current.provider === "shopify"
          ? { settings: { shopDomain: shop.trim().toLowerCase() } }
          : {}),
      });
      const destination = new URL(result.authorizationUrl);
      if (destination.protocol !== "https:") throw Error("CONNECTION_UNAVAILABLE");
      window.location.assign(destination.href);
    } catch {
      if (live.current)
        setError(tr("arc.chat.arcAppConnectionCard.connectionCouldNotStartPleaseTry"));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function credential(input: AppCredentialInput) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await appsRequest("connections", { provider: current.provider, ...input });
      await resume(result.connection.id);
      return true;
    } catch {
      if (live.current)
        setError(tr("arc.chat.arcAppConnectionCard.connectionCouldNotFinishCheckThe"));
      return false;
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function cancel() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await arcRequest("app-connections/" + current.id, {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      });
      if (live.current) {
        setCurrent((value) => ({ ...value, status: "cancelled" }));
        await onChanged();
      }
    } catch {
      if (live.current) setError(tr("arc.chat.arcAppConnectionCard.pleaseTryAgain"));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  const closed = current.status === "cancelled" || current.status === "expired";
  return (
    <section
      className="arcAppConnectionCard"
      data-status={current.status}
      aria-label={tr("arc.chat.arcAppConnectionCard.connect", { name: current.name })}
    >
      <header>
        <span className="arcAppConnectionBrand">
          <img src={"/app-brands/" + current.brand + ".svg"} width={30} height={30} alt="" />
        </span>
        <div>
          <strong>
            {current.status === "resumed"
              ? tr("arc.chat.arcAppConnectionCard.connected", { name: current.name })
              : tr("arc.chat.arcAppConnectionCard.connect", { name: current.name })}
          </strong>
          <p>
            {current.status === "resumed"
              ? tr("arc.chat.arcAppConnectionCard.readyToUseInThisConversation")
              : closed
                ? current.status === "expired"
                  ? tr("arc.chat.arcAppConnectionCard.thisConnectionRequestHasExpired")
                  : tr("arc.chat.arcAppConnectionCard.connectionCancelled")
                : current.configured
                  ? tr("arc.chat.arcAppConnectionCard.connectOnceAndILlContinue")
                  : tr("arc.chat.arcAppConnectionCard.thisAppIsTemporarilyUnavailableYour")}
          </p>
        </div>
      </header>
      {["pending", "expired"].includes(current.status) && current.configured && (
        <>
          {current.requiresBetaApproval ? (
            <div className="arcAppConnectionActions">
              <p>{tr("arc.chat.arcAppConnectionCard.googleAppsAreInLimitedBeta")}</p>
              <a href={"/apps?apply=" + encodeURIComponent(current.provider)}>
                {tr("arc.chat.arcAppConnectionCard.applyForBeta")}
              </a>
              <button type="button" disabled={busy} onClick={() => void onChanged()}>
                {tr("arc.chat.arcAppConnectionCard.refreshAccess")}
              </button>
            </div>
          ) : credentials ? (
            <AppCredentialForm
              provider={current.provider}
              write
              busy={busy}
              onConnect={credential}
              onCancel={() => setCredentials(false)}
            />
          ) : (
            <>
              <div>
                {current.dataPolicy && (
                  <GoogleDataNotice
                    provider={current.provider}
                    checked={dataAccepted}
                    onChange={setDataAccepted}
                  />
                )}
              </div>
              <div className="arcAppConnectionActions">
                {current.provider === "shopify" && (
                  <label>
                    {tr("arc.chat.arcAppConnectionCard.storeAddress")}
                    <input
                      type="text"
                      value={shop}
                      onChange={(event) => setShop(event.target.value)}
                      placeholder="your-store.myshopify.com"
                      autoComplete="url"
                      maxLength={100}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="arcRadiantCta"
                  disabled={
                    busy ||
                    Boolean(current.dataPolicy && !dataAccepted) ||
                    (current.provider === "shopify" &&
                      !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop.trim().toLowerCase()))
                  }
                  onClick={() => void connect()}
                >
                  {busy
                    ? tr("arc.chat.arcAppConnectionCard.connecting")
                    : tr("arc.chat.arcAppConnectionCard.connect", { name: current.name })}
                </button>
                <button
                  type="button"
                  className="arcAppConnectionLater"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  {tr("arc.chat.arcAppConnectionCard.notNow")}
                </button>
              </div>
            </>
          )}
          <small>{tr("arc.chat.arcAppConnectionCard.yourSignInDetailsStayPrivate")}</small>
        </>
      )}
      {current.status === "pending" && !current.configured && (
        <div className="arcAppConnectionActions">
          <button
            type="button"
            className="arcAppConnectionLater"
            disabled={busy}
            onClick={() => void cancel()}
          >
            {tr("arc.chat.arcAppConnectionCard.notNow")}
          </button>
        </div>
      )}
      {error && (
        <p className="arcAppConnectionError" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
