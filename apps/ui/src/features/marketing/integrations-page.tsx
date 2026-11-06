import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import directory from "../../data/app-directory.json" with { type: "json" };
import "../../styles/marketing/integrations-page.css";
type Availability = { enabled: boolean; providers: { provider: string; ready: boolean }[] };
type AvailabilityState =
  { state: "loading" } | { state: "unavailable" } | { state: "loaded"; data: Availability };
function validAvailability(value: unknown): value is Availability {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Availability>;
  return (
    typeof item.enabled === "boolean" &&
    Array.isArray(item.providers) &&
    item.providers.every(
      (provider) =>
        provider && typeof provider.provider === "string" && typeof provider.ready === "boolean",
    )
  );
}
export function IntegrationsPage() {
  const { tr, locale } = useI18n();
  const params = new URLSearchParams(window.location.search),
    initialCategory = params.get("category");
  const [category, setCategory] = useState(() =>
    directory.categories.some((item) => item.id === initialCategory) ? initialCategory! : "all",
  );
  const [query, setQuery] = useState(""),
    [selectedProvider, setSelectedProvider] = useState(() => params.get("provider") || "");
  const [availability, setAvailability] = useState<AvailabilityState>({ state: "loading" }),
    [refresh, setRefresh] = useState(0);
  const detailRef = useRef<HTMLElement>(null),
    catalogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController(),
      timer = window.setTimeout(() => controller.abort(), 8000);
    setAvailability({ state: "loading" });
    void fetch("https://mcp.remotearc.app/api/apps/status", {
      credentials: "omit",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw Error("unavailable");
        const data: unknown = await response.json().then(canonicalErrorEnvelope);
        if (!validAvailability(data)) throw Error("unavailable");
        if (active) setAvailability({ state: "loaded", data });
      })
      .catch(() => {
        if (active) setAvailability({ state: "unavailable" });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);
  const filtered = directory.apps.filter(
    (app) =>
      (category === "all" || app.category === category) &&
      (app.name + " " + app.provider).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = filtered.find((app) => app.provider === selectedProvider) || filtered[0];
  const unknownProvider = Boolean(
    selectedProvider && !directory.apps.some((app) => app.provider === selectedProvider),
  );
  const ready =
    selected &&
    availability.state === "loaded" &&
    availability.data.enabled &&
    availability.data.providers.some((item) => item.provider === selected.provider && item.ready);
  function updateUrl(nextCategory: string, provider?: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("category");
    url.searchParams.delete("provider");
    if (nextCategory !== "all") url.searchParams.set("category", nextCategory);
    if (provider) url.searchParams.set("provider", provider);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  function chooseCategory(value: string) {
    setCategory(value);
    setQuery("");
    setSelectedProvider("");
    updateUrl(value);
  }
  function chooseProvider(provider: string) {
    setSelectedProvider(provider);
    updateUrl(category, provider);
    if (window.matchMedia("(max-width:860px)").matches)
      detailRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth",
      });
  }
  return (
    <main className="integrationsPage">
      <header className="integrationsHero">
        <a href={localizedWebsiteHref("/#apps", locale)}>
          ← {tr("marketing.integrationsPage.backToRemoteArc")}
        </a>
        <span className="eyebrow">REMOTE ARC CONNECT / APPS</span>
        <h1>{tr("marketing.integrationsPage.exploreYourIntegrations")}</h1>
        <p>{tr("marketing.integrationsPage.findTheAppsForYourWork")}</p>
        <span className="integrationsCount">
          {directory.apps.length} {tr("marketing.integrationsPage.nativeIntegrations")} ·{" "}
          {directory.categories.length} {tr("marketing.integrationsPage.categories")}
        </span>
      </header>
      <div className="integrationsLayout">
        <div className="integrationsCatalog" ref={catalogRef}>
          <label className="integrationsSearch">
            {tr("marketing.integrationsPage.findAnApp")}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("marketing.integrationsPage.searchApps")}
            />
          </label>
          <div
            className="integrationsFilters"
            role="group"
            aria-label={tr("marketing.integrationsPage.appCategories")}
          >
            <button
              type="button"
              aria-pressed={category === "all"}
              onClick={() => chooseCategory("all")}
            >
              {tr("marketing.integrationsPage.allApps")}
            </button>
            {directory.categories.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => chooseCategory(item.id)}
              >
                {tr(item.name, item.nameZh)}
              </button>
            ))}
          </div>
          {unknownProvider && (
            <p className="integrationsNotice" role="status">
              {tr("marketing.integrationsPage.thatAppIsNotInThe")}
            </p>
          )}
          <p className="integrationsResults">
            {filtered.length} {tr("marketing.integrationsPage.integrations")}
          </p>
          <ul className="integrationsGrid">
            {filtered.map((app) => (
              <li key={app.provider}>
                <button
                  type="button"
                  data-provider={app.provider}
                  aria-pressed={selected?.provider === app.provider}
                  onClick={() => chooseProvider(app.provider)}
                >
                  <span className="integrationsBrand" data-brand={app.brand}>
                    <img src={"/app-brands/" + app.brand + ".svg"} alt="" width="30" height="30" />
                  </span>
                  <span>
                    <strong>{app.name}</strong>
                    <small>
                      {app.operationCount} {tr("marketing.integrationsPage.operations")}
                    </small>
                  </span>
                  <span className="integrationsSelectArrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!filtered.length && (
            <p className="integrationsNotice" role="status">
              {tr("marketing.integrationsPage.noAppsMatchYourSearch")}
            </p>
          )}
        </div>
        <aside
          className="integrationDetail"
          ref={detailRef}
          aria-label={tr("marketing.integrationsPage.selectedIntegrationDetails")}
        >
          {selected ? (
            <>
              <header>
                <span className="integrationsBrand" data-brand={selected.brand}>
                  <img
                    src={"/app-brands/" + selected.brand + ".svg"}
                    alt=""
                    width="40"
                    height="40"
                  />
                </span>
                <div>
                  <span className="eyebrow">
                    {selected.auth === "api_key"
                      ? tr("marketing.integrationsPage.yourApiAccount")
                      : tr("marketing.integrationsPage.accountAuthorization")}
                  </span>
                  <h2>{selected.name}</h2>
                </div>
              </header>
              <section className="integrationAvailability" aria-live="polite">
                <h3>{tr("marketing.integrationsPage.connectionAvailability")}</h3>
                {availability.state === "loading" ? (
                  <p role="status">
                    {tr("marketing.integrationsPage.checkingTheConnectionService")}
                  </p>
                ) : ready ? (
                  <>
                    <p>{tr("marketing.integrationsPage.thisIntegrationIsReadyForAccount")}</p>
                    <a
                      className="primaryButton"
                      href={
                        "https://agent.remotearc.app/apps?provider=" +
                        encodeURIComponent(selected.provider)
                      }
                    >
                      {tr("marketing.integrationsPage.connectYourAccount")} ↗
                    </a>
                  </>
                ) : (
                  <>
                    <p>
                      {availability.state === "unavailable"
                        ? tr("marketing.integrationsPage.weCouldnTCheckConnectionAvailability")
                        : availability.data.enabled
                          ? tr("marketing.integrationsPage.accountConnectionForThisAppIs")
                          : tr(
                              "marketing.integrationsPage.appConnectionsAreTemporarilyUnavailablePlease",
                            )}
                    </p>
                    <button type="button" disabled>
                      {availability.state === "unavailable"
                        ? tr("marketing.integrationsPage.statusUnavailable")
                        : availability.data.enabled
                          ? tr("marketing.integrationsPage.comingSoon")
                          : tr("marketing.integrationsPage.temporarilyUnavailable")}
                    </button>
                    {availability.state === "unavailable" && (
                      <button
                        className="integrationRetry"
                        type="button"
                        onClick={() => setRefresh((value) => value + 1)}
                      >
                        {tr("marketing.integrationsPage.checkAgain")}
                      </button>
                    )}
                  </>
                )}
              </section>
              <section className="integrationSetup">
                <h3>{tr("marketing.integrationsPage.whatYouNeed")}</h3>
                <p>
                  {selected.auth === "api_key"
                    ? tr("marketing.integrationsPage.useAnApiKeyOrAccess")
                    : tr("marketing.integrationsPage.signInOnTheProviderS")}
                </p>
                {selected.connectionNote && <p>{selected.connectionNote}</p>}
                <p>{tr("marketing.integrationsPage.connectingEnablesTheSupportedReadAnd")}</p>
              </section>
              <section className="integrationBilling">
                <h3>{tr("marketing.integrationsPage.usageAndCosts")}</h3>
                <p>{selected.billingNote}</p>
                <p>{tr("marketing.integrationsPage.remoteArcToolCallLimitsAnd")}</p>
              </section>
              <section className="integrationOperations">
                <h3>
                  {tr("marketing.integrationsPage.supportedOperations")}{" "}
                  <span>{selected.operationCount}</span>
                </h3>
                <ul>
                  {selected.operations.map((operation) => (
                    <li key={operation.name}>
                      <strong>{operation.description}</strong>
                      <code>{operation.name}</code>
                      <span data-permission={operation.permission}>
                        {operation.permission === "write"
                          ? tr("marketing.integrationsPage.write")
                          : tr("marketing.integrationsPage.read")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <button
                className="integrationChooseAnother"
                type="button"
                onClick={() => catalogRef.current?.scrollIntoView({ block: "start" })}
              >
                {tr("marketing.integrationsPage.chooseAnotherApp")} ↑
              </button>
            </>
          ) : (
            <p>{tr("marketing.integrationsPage.chooseAnIntegrationToSeeIts")}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
