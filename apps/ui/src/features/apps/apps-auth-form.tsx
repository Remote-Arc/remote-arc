import { useState, type FormEvent } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
export type AppCredentialInput = {
  credential: string;
  permissions: ("read" | "write")[];
  settings: Record<string, string>;
  dailyCallLimit: number;
  usageConsent: true;
};
export function AppCredentialForm({
  provider,
  write,
  busy,
  onConnect,
  onCancel,
}: {
  provider: string;
  write: boolean;
  busy: boolean;
  onConnect: (input: AppCredentialInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { tr } = useI18n(),
    [credential, setCredential] = useState(""),
    [businessAccountId, setBusinessAccountId] = useState(""),
    [phoneNumberId, setPhoneNumberId] = useState(""),
    [dailyCallLimit, setDailyCallLimit] = useState(25),
    [consent, setConsent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent || busy || !credential.trim()) return;
    try {
      const ok = await onConnect({
        credential: credential.trim(),
        permissions: write ? ["read", "write"] : ["read"],
        settings: provider === "whatsapp" ? { businessAccountId, phoneNumberId } : {},
        dailyCallLimit,
        usageConsent: true,
      });
      if (ok) onCancel();
    } finally {
      setCredential("");
      setConsent(false);
    }
  }
  return (
    <form className="appsCredentialForm" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={busy}>
        <legend>{tr("apps.appsAuthForm.connectYourApiAccount")}</legend>
        <label>
          {provider === "x"
            ? tr("apps.appsAuthForm.oauthUserAccessToken")
            : tr("apps.appsAuthForm.apiKeyOrAccessToken")}
          <input
            type="password"
            name="api-credential"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            required
            minLength={10}
            maxLength={4096}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {provider === "whatsapp" && (
          <>
            <label>
              {tr("apps.appsAuthForm.whatsappBusinessAccountId")}
              <input
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                required
                inputMode="numeric"
                pattern="[0-9]{1,30}"
              />
            </label>
            <label>
              {tr("apps.appsAuthForm.phoneNumberId")}
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                required
                inputMode="numeric"
                pattern="[0-9]{1,30}"
              />
            </label>
          </>
        )}
        <label>
          {tr("apps.appsAuthForm.dailyOperationLimit")}
          <input
            type="number"
            value={dailyCallLimit}
            onChange={(e) => setDailyCallLimit(Number(e.target.value))}
            min={1}
            max={1000}
            required
          />
        </label>
        <label className="appsCredentialConsent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span>{tr("apps.appsAuthForm.iAuthorizeAccountValidationAndApi")}</span>
        </label>
      </fieldset>
      <p>{tr("apps.appsAuthForm.yourCredentialIsEncryptedOnThe")}</p>
      <div>
        <button
          className="appsManagerPrimary"
          type="submit"
          disabled={busy || !consent || !credential.trim()}
        >
          {tr("apps.appsAuthForm.validateConnect")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCredential("");
            onCancel();
          }}
        >
          {tr("apps.appsAuthForm.cancel")}
        </button>
      </div>
    </form>
  );
}
