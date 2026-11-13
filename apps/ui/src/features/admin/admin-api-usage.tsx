import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/admin/payments/admin-payments.css";
type Usage = {
  month: string;
  modelActivity: { users: number; todayCalls: number };
  modelRatedCostUsd: number;
  heldModelMaximumUsd: number;
  modelCalls: Array<{
    provider: string;
    model_id: string;
    status: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
};
export function AdminApiUsage({ preview = false }: { preview?: boolean }) {
  const { tr } = useI18n(),
    [data, setData] = useState<Usage | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (preview) {
      setData({
        month: new Date().toISOString().slice(0, 7),
        modelActivity: { users: 6, todayCalls: 40 },
        modelRatedCostUsd: 0.025,
        heldModelMaximumUsd: 0.07,
        modelCalls: [
          {
            provider: "openai",
            model_id: "arc-auto",
            status: "completed",
            calls: 40,
            inputTokens: 70000,
            outputTokens: 9000,
            cost: 25000,
          },
        ],
      });
      return;
    }
    const controller = new AbortController();
    setError("");
    void fetch("/api/admin/arc-billing", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json().then(canonicalErrorEnvelope);
      })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(tr("admin.adminApiUsage.couldNotLoadModelUsage"));
      });
    return () => controller.abort();
  }, [preview, revision, tr]);
  const rows = data?.modelCalls || [],
    calls = rows.reduce((sum, row) => sum + row.calls, 0),
    failed = rows.filter((row) => row.status === "failed").reduce((sum, row) => sum + row.calls, 0),
    unknown = rows
      .filter((row) => !["completed", "failed"].includes(row.status))
      .reduce((sum, row) => sum + row.calls, 0),
    tokens = rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
  const labels: Record<string, string> = {
    completed: tr("admin.adminApiUsage.completed"),
    failed: tr("admin.adminApiUsage.failed"),
    reserved: tr("admin.adminApiUsage.reserved"),
    unknown: tr("admin.adminApiUsage.checkResult"),
    settling: tr("admin.adminApiUsage.settling"),
  };
  return (
    <section className="adminSurface adminApiUsage">
      <div className="adminSectionHeader">
        <div>
          <h2>{tr("admin.adminApiUsage.modelApiUsage")}</h2>
          <p>{tr("admin.adminApiUsage.thisMonthUtcConnectToolCalls")}</p>
        </div>
        <button
          type="button"
          className="adminOutlineBtn"
          onClick={() => setRevision((value) => value + 1)}
        >
          {tr("admin.adminApiUsage.refresh")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!data && !error && (
        <WorkspaceLoading label={tr("admin.adminApiUsage.loadingApiUsage")} variant="cards" />
      )}
      {data && (
        <>
          <div className="adminMetrics adminMetrics--overview">
            {[
              {
                label: tr("admin.adminApiUsage.modelRequestsUsers"),
                value: calls.toLocaleString() + " / " + data.modelActivity.users,
              },
              {
                label: tr("admin.adminApiUsage.requestsToday"),
                value: data.modelActivity.todayCalls.toLocaleString(),
              },
              { label: tr("admin.adminApiUsage.reportedTokens"), value: tokens.toLocaleString() },
              { label: tr("admin.adminApiUsage.failedToVerify"), value: failed + " / " + unknown },
              {
                label: tr("admin.adminApiUsage.ratedModelCost"),
                value: "US$" + data.modelRatedCostUsd.toFixed(4),
              },
              {
                label: tr("admin.adminApiUsage.maximumCostReserved"),
                value: "US$" + data.heldModelMaximumUsd.toFixed(4),
              },
            ].map((item) => (
              <article className="adminMetricCard" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="adminPaymentTable">
            <table>
              <thead>
                <tr>
                  {[
                    tr("admin.adminApiUsage.modelProvider"),
                    tr("admin.adminApiUsage.status"),
                    tr("admin.adminApiUsage.requests"),
                    tr("admin.adminApiUsage.inputOutputTokens"),
                    tr("admin.adminApiUsage.ratedCostOrReserve"),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.provider + row.model_id + row.status}>
                    <td>
                      {row.model_id === "arc-auto" ? "Auto · GPT-6 Luna" : row.model_id}
                      <small>{row.provider}</small>
                    </td>
                    <td>{labels[row.status] || row.status}</td>
                    <td>{row.calls.toLocaleString()}</td>
                    <td>
                      {row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}
                    </td>
                    <td>US${(row.cost / 1e6).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="adminNoData">
                {tr("admin.adminApiUsage.noModelRequestsRecordedThisMonth")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
