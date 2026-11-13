import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
type Trial = {
  user_id: string;
  email: string;
  name: string | null;
  started_at: string;
  expires_at: string;
  status: string;
  grantedCredits: number;
  spentCredits: number;
  reservedCredits: number;
  runs: number;
  succeeded: number;
  last_run_at: string | null;
};
type Funnel = Record<"opened" | "trials" | "ran" | "succeeded" | "returned" | "routines", number>;
type Trials = { items: Trial[]; total: number; pageSize: number; funnel?: Funnel };
export function AdminTrials({ preview = false }: { preview?: boolean }) {
  const { tr } = useI18n(),
    [data, setData] = useState<Trials | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (preview) {
      setData({ items: [], total: 0, pageSize: 30 });
      return;
    }
    const controller = new AbortController();
    setError("");
    setData(null);
    void fetch(
      "/api/admin/payments/trials?" + new URLSearchParams({ q: query, status, page: String(page) }),
      { credentials: "same-origin", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json().then(canonicalErrorEnvelope);
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(tr("admin.payments.adminTrials.couldNotLoadTrialUsersRetry"));
      });
    return () => controller.abort();
  }, [preview, query, status, page, revision, tr]);
  const labels: Record<string, string> = {
    all: tr("admin.payments.adminTrials.allTrials"),
    active: tr("admin.payments.adminTrials.active"),
    expired: tr("admin.payments.adminTrials.expired"),
    exhausted: tr("admin.payments.adminTrials.allowanceUsed"),
    paid: tr("admin.payments.adminTrials.nowPaid"),
  };
  const date = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");
  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery(search.trim());
    setPage(0);
  }
  return (
    <section className="adminSurface adminTrials">
      <div className="adminSectionHeader">
        <div>
          <h2>{tr("admin.payments.adminTrials.peopleTryingArc")}</h2>
          <p>{tr("admin.payments.adminTrials.recordedWhenAUserExplicitlyActivates")}</p>
        </div>
      </div>
      {data?.funnel && (
        <div className="adminTrialFunnel">
          <h3>{tr("admin.payments.adminTrials.arcFunnelLast30Days")}</h3>
          <ol>
            {(
              [
                ["opened", tr("admin.payments.adminTrials.openedArc")],
                ["trials", tr("admin.payments.adminTrials.startedATrial")],
                ["ran", tr("admin.payments.adminTrials.ranATask")],
                ["succeeded", tr("admin.payments.adminTrials.hadASuccess")],
                ["returned", tr("admin.payments.adminTrials.cameBackAnotherDay")],
                ["routines", tr("admin.payments.adminTrials.ranARoutine")],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                <strong>{data.funnel![key].toLocaleString()}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <p>{tr("admin.payments.adminTrials.eachStepCountsPeopleOnItsOwn")}</p>
        </div>
      )}
      <form className="adminTrialFilters" onSubmit={submit}>
        <label>
          <span className="arcSrOnly">{tr("admin.payments.adminTrials.searchTrialUsers")}</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("admin.payments.adminTrials.nameOrEmail")}
          />
        </label>
        <button className="adminOutlineBtn">{tr("admin.payments.adminTrials.search")}</button>
        <label>
          <span className="arcSrOnly">{tr("admin.payments.adminTrials.trialStatus")}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="adminOutlineBtn"
          onClick={() => setRevision((value) => value + 1)}
        >
          {tr("admin.payments.adminTrials.refresh")}
        </button>
      </form>
      {error && (
        <p className="adminAlert" role="alert">
          {error}
        </p>
      )}
      {!data && !error && (
        <WorkspaceLoading
          label={tr("admin.payments.adminTrials.loadingTrialUsers")}
          variant="rows"
        />
      )}
      {data && (
        <>
          <p>
            {tr("admin.payments.adminTrials.total")} {data.total}{" "}
            {tr("admin.payments.adminTrials.trialUsers")}
            {preview
              ? " · " + tr("admin.payments.adminTrials.previewNoPrivateUserRecordsLoaded")
              : ""}
          </p>
          <div className="adminPaymentTable">
            <table>
              <thead>
                <tr>
                  {[
                    tr("admin.payments.adminTrials.user"),
                    tr("admin.payments.adminTrials.status"),
                    tr("admin.payments.adminTrials.trialPeriod"),
                    tr("admin.payments.adminTrials.trialCredits"),
                    tr("admin.payments.adminTrials.arcWork"),
                    tr("admin.payments.adminTrials.lastWork"),
                  ].map((title) => (
                    <th key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.user_id}>
                    <td>
                      <strong>{user.name || user.email}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>{labels[user.status] || user.status}</td>
                    <td>
                      {date(user.started_at)}
                      <small>
                        {tr("admin.payments.adminTrials.until") + date(user.expires_at)}
                      </small>
                    </td>
                    <td>
                      {user.spentCredits.toLocaleString()} / {user.grantedCredits.toLocaleString()}
                      <small>
                        {user.reservedCredits.toLocaleString()}{" "}
                        {tr("admin.payments.adminTrials.reserved")}
                      </small>
                    </td>
                    <td>
                      {user.runs}
                      <small>
                        {user.succeeded} {tr("admin.payments.adminTrials.completed")}
                      </small>
                    </td>
                    <td>{date(user.last_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && (
              <p className="adminNoData">
                {tr("admin.payments.adminTrials.noTrialUsersMatchTheseFilters")}
              </p>
            )}
          </div>
          <div className="adminPager">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              {tr("admin.payments.adminTrials.previous")}
            </button>
            <span>{page + 1}</span>
            <button
              type="button"
              disabled={(page + 1) * data.pageSize >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {tr("admin.payments.adminTrials.next")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
