import React, { useState, type FormEvent } from "react";
import { PublicLayout } from "../../components/public-layout.js";
import { useI18n } from "../../hooks/use-i18n.js";
import {
  CAREERS_MESSAGE_LIMIT,
  useCareersInterest,
  type CareersInterest,
} from "../../hooks/company/use-careers-interest.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import type { User } from "../../types/app-types.js";
import "../../styles/marketing/public-engagement.css";
import "../../styles/company/company-pages.css";

// Stored as the English code, so Admin reads the same whatever language the visitor used.
const AREAS = [
  ["engineering", "company.careers.area.engineering"],
  ["design", "company.careers.area.design"],
  ["community", "company.careers.area.community"],
  ["other", "company.careers.area.other"],
] as const;

const WORK = [
  "company.careers.work.agent",
  "company.careers.work.relay",
  "company.careers.work.web",
  "company.careers.work.clients",
  "company.careers.work.security",
] as const;

/** /careers: no fixed roles yet, so visitors leave a note about what they would work on. */
export function CareersPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const { status, error, submit, preview } = useCareersInterest();
  const [form, setForm] = useState<CareersInterest>({
    name: "",
    email: "",
    area: "engineering",
    link: "",
    message: "",
    consent: false,
    website: "",
  });
  const set = <Key extends keyof CareersInterest>(key: Key, value: CareersInterest[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(form);
  };

  return (
    <PublicLayout user={user}>
      <main className="companyPage">
        <header className="companyHeader">
          <span className="eyebrow">{tr("company.careers.eyebrow")}</span>
          <h1>{tr("company.careers.title")}</h1>
          <p>{tr("company.careers.intro")}</p>
        </header>

        <div className="careersLayout">
          <section className="companySection" aria-labelledby="careers-work">
            <h2 id="careers-work">{tr("company.careers.work.title")}</h2>
            <ul className="careersWork">
              {WORK.map((key) => (
                <li key={key}>{tr(key)}</li>
              ))}
            </ul>
            <p className="careersNote">{tr("company.careers.note")}</p>
          </section>

          <section className="careersFormCard" aria-labelledby="careers-form-title">
            <h2 id="careers-form-title">{tr("company.careers.form.title")}</h2>
            {status === "sent" ? (
              <div className="careersSent" role="status">
                <strong>{tr("company.careers.form.sentTitle")}</strong>
                <p>{tr("company.careers.form.sentBody")}</p>
              </div>
            ) : (
              <form className="careersForm" onSubmit={onSubmit}>
                <label>
                  <span>{tr("company.careers.form.name")}</span>
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                  />
                </label>
                <label>
                  <span>{tr("company.careers.form.email")}</span>
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => set("email", event.target.value)}
                  />
                </label>
                <label>
                  <span>{tr("company.careers.form.area")}</span>
                  <select value={form.area} onChange={(event) => set("area", event.target.value)}>
                    {AREAS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {tr(label)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{tr("company.careers.form.link")}</span>
                  <input
                    type="url"
                    maxLength={300}
                    placeholder="https://"
                    value={form.link}
                    onChange={(event) => set("link", event.target.value)}
                  />
                </label>
                <label>
                  <span>{tr("company.careers.form.message")}</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={CAREERS_MESSAGE_LIMIT}
                    rows={6}
                    value={form.message}
                    onChange={(event) => set("message", event.target.value)}
                  />
                </label>
                <div className="engagementBotField" aria-hidden="true">
                  <label htmlFor="careers-website">Website</label>
                  <input
                    id="careers-website"
                    autoComplete="off"
                    tabIndex={-1}
                    value={form.website}
                    onChange={(event) => set("website", event.target.value)}
                  />
                </div>
                <label className="engagementConsent">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(event) => set("consent", event.target.checked)}
                  />
                  <span>
                    {tr("marketing.publicEngagement.iAgreeThatRemoteArcMay")}{" "}
                    <a
                      href={localizedWebsiteHref("/privacy", locale)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("marketing.publicEngagement.privacyPolicy")}
                    </a>
                  </span>
                </label>
                {preview && (
                  <p className="engagementPreviewWarning">
                    {tr("marketing.publicEngagement.uiPreviewOnlyNoRealSubmissions")}
                  </p>
                )}
                {error && (
                  <p className="engagementError" role="alert">
                    {error}
                  </p>
                )}
                <button className="primaryButton" disabled={status === "sending" || !form.consent}>
                  {status === "sending"
                    ? tr("company.careers.form.sending")
                    : tr("company.careers.form.send")}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </PublicLayout>
  );
}
