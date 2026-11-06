import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState } from "react";
import { CenteredCard } from "../../components/public-layout.js";
import { useI18n } from "../../hooks/use-i18n.js";
import {
  normalizeSecret,
  sealSecret,
  SECRET_MAX_LENGTH,
  SECRET_MIN_LENGTH,
} from "./secret-crypto.js";
import "../../styles/secrets/secret-entry.css";

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
      .then(async (response) =>
        response.ok ? ((await response.json().then(canonicalErrorEnvelope)) as Request) : null,
      )
      .catch(() => null)
      .then((payload) => {
        if (!cancelled) setRequest(payload);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (request === undefined)
    return <CenteredCard title={tr("secrets.secretEntry.loadingRequest")} body="" />;
  if (request === null) {
    return (
      <CenteredCard
        title={tr("secrets.secretEntry.requestNotFound")}
        body={tr("secrets.secretEntry.thisLinkIsNotForThe")}
      />
    );
  }
  if (done || request.status === "delivered" || request.status === "used") {
    return (
      <CenteredCard
        title={tr("secrets.secretEntry.sentToYourDevice")}
        body={tr("secrets.secretEntry.theSecretIsOnEncryptedEnd", { name: request.device.name })}
      />
    );
  }
  if (request.status !== "pending" || !request.public_key) {
    return (
      <CenteredCard
        title={tr("secrets.secretEntry.thisRequestHasExpired")}
        body={tr("secrets.secretEntry.requestsLastMinutesAskYourAi")}
      />
    );
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
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(
          payload.error === "DEVICE_OFFLINE"
            ? tr("secrets.secretEntry.isOfflineTurnItOnAnd", { name: request.device.name })
            : payload.error === "EXPIRED"
              ? tr("secrets.secretEntry.thisRequestHasExpiredAskYour")
              : tr("secrets.secretEntry.yourDeviceCouldNotTakeThe"),
        );
        return;
      }
      setValue("");
      setDone(true);
    } catch {
      setError(tr("secrets.secretEntry.theSecretCouldNotBeEncrypted"));
    } finally {
      setBusy(false);
    }
  }

  const where = request.site
    ? tr("secrets.secretEntry.itWillBeFilledOnceOn", {
        site: request.site,
        name: request.device.name,
      })
    : tr("secrets.secretEntry.itWillBeGivenOnceTo", { name: request.device.name });
  return (
    <CenteredCard
      title={tr("secrets.secretEntry.enterASecretForYourAi")}
      body={tr("secrets.secretEntry.askedForThisYourAiWill", {
        requested_by: request.requested_by,
      })}
    >
      <form className="secretEntry" onSubmit={(event) => void submit(event)}>
        <dl className="secretEntryFacts">
          <dt>{tr("secrets.secretEntry.for")}</dt>
          <dd>{request.purpose}</dd>
          <dt>{tr("secrets.secretEntry.goesTo")}</dt>
          <dd>{where}</dd>
          <dt>{tr("secrets.secretEntry.expires")}</dt>
          <dd>{new Date(request.expires_at).toLocaleTimeString()}</dd>
        </dl>
        <label className="secretEntryField">
          <span>{tr("secrets.secretEntry.secret")}</span>
          <span className="secretEntryInput">
            <input
              type={shown ? "text" : "password"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              maxLength={SECRET_MAX_LENGTH + 64}
              aria-describedby="secret-entry-note"
            />
            <button
              type="button"
              className="ghostButton small"
              onClick={() => setShown(!shown)}
              aria-pressed={shown}
            >
              {shown ? tr("secrets.secretEntry.hide") : tr("secrets.secretEntry.show")}
            </button>
          </span>
        </label>
        <p id="secret-entry-note" className="secretEntryNote">
          {tr("secrets.secretEntry.encryptedInThisBrowserToA")}
        </p>
        {error && (
          <p className="secretEntryError" role="alert">
            {error}
          </p>
        )}
        <button className="primaryButton" type="submit" disabled={!valid || busy}>
          {busy ? tr("secrets.secretEntry.sending") : tr("secrets.secretEntry.sendToMyDevice")}
        </button>
      </form>
    </CenteredCard>
  );
}
