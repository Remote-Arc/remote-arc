import { useState } from "react";
import { percent, retentionState, type Analytics, type Translate } from "./admin-events-model.js";

export function GrowthChart({ data, tr }: { data: Analytics | null; tr: Translate }) {
  const [metric, setMetric] = useState<"activeUsers" | "payingUsers">("activeUsers");
  const rows = data?.trend || [],
    maximum = Math.max(1, ...rows.flatMap((row) => [row.newUsers, row[metric]]));
  const width = 760,
    height = 210,
    left = 34,
    top = 16,
    plotWidth = width - 52,
    plotHeight = height - 54;
  const point = (value: number, index: number) => [
    left + (rows.length > 1 ? index / (rows.length - 1) : 0.5) * plotWidth,
    top + plotHeight - (value / maximum) * plotHeight,
  ];
  return (
    <section className="businessPanel businessGrowth">
      <header>
        <div>
          <h2>{tr("admin.events.adminEventsPanels.areMorePeopleComingBack")}</h2>
          <p>{tr("admin.events.adminEventsPanels.dailyRegistrationsAndRealProductActivity")}</p>
        </div>
        <select
          aria-label={tr("admin.events.adminEventsPanels.trendMetric")}
          value={metric}
          onChange={(event) => setMetric(event.target.value as typeof metric)}
        >
          <option value="activeUsers">{tr("admin.events.adminEventsPanels.activeUsers")}</option>
          <option value="payingUsers">{tr("admin.events.adminEventsPanels.payingUsers")}</option>
        </select>
      </header>
      {data ? (
        <>
          <div className="businessLegend">
            <span data-series="new">{tr("admin.events.adminEventsPanels.newUsers")}</span>
            <span data-series="active">
              {metric === "activeUsers"
                ? tr("admin.events.adminEventsPanels.recordedActiveUsers")
                : tr("admin.events.adminEventsPanels.verifiedPayingUsers")}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={tr("admin.events.adminEventsPanels.dailyUserTrendExactValuesIn")}
          >
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <line
                  x1={left}
                  x2={width - 18}
                  y1={top + plotHeight * fraction}
                  y2={top + plotHeight * fraction}
                  className="businessGridline"
                />
                <text x={left - 10} y={top + plotHeight * fraction + 4} textAnchor="end">
                  {Math.round(maximum * (1 - fraction))}
                </text>
              </g>
            ))}
            <polyline
              points={rows.map((row, i) => point(row[metric], i).join(",")).join(" ")}
              className="businessLine businessLineActive"
            />
            <polyline
              points={rows.map((row, i) => point(row.newUsers, i).join(",")).join(" ")}
              className="businessLine businessLineNew"
            />
            {rows.map((row, i) => (
              <g key={row.day}>
                <circle
                  cx={point(row.newUsers, i)[0]}
                  cy={point(row.newUsers, i)[1]}
                  r="3"
                  className="businessPoint"
                >
                  <title>
                    {row.day}: {row.newUsers} / {row[metric]}
                  </title>
                </circle>
                {(i === 0 || i === rows.length - 1 || i % Math.ceil(rows.length / 5) === 0) && (
                  <text x={point(0, i)[0]} y={height - 8} textAnchor="middle">
                    {row.day.slice(5)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <details className="businessSource">
            <summary>{tr("admin.events.adminEventsPanels.dailyFigures")}</summary>
            <div className="businessTableScroll">
              <table>
                <thead>
                  <tr>
                    <th>{tr("admin.events.adminEventsPanels.dateUtc")}</th>
                    <th>{tr("admin.events.adminEventsPanels.new")}</th>
                    <th>{tr("admin.events.adminEventsPanels.recordedActive")}</th>
                    <th>{tr("admin.events.adminEventsPanels.paid")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{row.newUsers}</td>
                      <td>{row.activeUsers}</td>
                      <td>{row.payingUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="businessChartEmpty">
          {tr("admin.events.adminEventsPanels.realUserTrendsAppearAfterData")}
        </div>
      )}
    </section>
  );
}

export function RetentionPanel({ data, tr }: { data: Analytics | null; tr: Translate }) {
  const [page, setPage] = useState(0),
    cohorts = data?.cohorts || [],
    rows = cohorts.slice(page * 7, page * 7 + 7);
  return (
    <section className="businessPanel businessRetention">
      <header>
        <div>
          <h2>{tr("admin.events.adminEventsPanels.doNewUsersStay")}</h2>
          <p>{tr("admin.events.adminEventsPanels.registrationCohortsOverDaysReturnsOn")}</p>
        </div>
        <span className="businessTag">
          {tr("admin.events.adminEventsPanels.registrationCohorts")}
        </span>
      </header>
      <div className="businessRetentionSummary">
        {[1, 7, 30].map((day) => {
          const cell = data?.retention.find((item) => item.day === day);
          return (
            <article key={day}>
              <span>
                {day === 1
                  ? tr("admin.events.adminEventsPanels.nextDayRetention")
                  : day + tr("admin.events.adminEventsPanels.dayRetention")}
              </span>
              <strong>{percent(cell?.rate)}</strong>
              <small>
                {cell?.status === "ready"
                  ? `${cell.returned} / ${cell.eligible} ` +
                    tr("admin.events.adminEventsPanels.eligibleUsersReturned")
                  : retentionState(cell, tr)}
              </small>
            </article>
          );
        })}
      </div>
      <div className="businessTableScroll">
        <table className="businessCohorts">
          <thead>
            <tr>
              <th>{tr("admin.events.adminEventsPanels.registered")}</th>
              <th>{tr("admin.events.adminEventsPanels.newUsers2")}</th>
              <th>{tr("admin.events.adminEventsPanels.day")}</th>
              <th>{tr("admin.events.adminEventsPanels.day2")}</th>
              <th>{tr("admin.events.adminEventsPanels.day3")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day}>
                <th scope="row">{row.day.slice(5)}</th>
                <td>{row.users}</td>
                {row.cells.map((cell) => (
                  <td
                    key={cell.day}
                    data-state={cell.status}
                    style={
                      cell.rate === null
                        ? undefined
                        : {
                            background: `color-mix(in srgb,var(--business-teal) ${Math.round(cell.rate * 24)}%,transparent)`,
                          }
                    }
                  >
                    <strong>
                      {cell.status === "ready" ? percent(cell.rate) : retentionState(cell, tr)}
                    </strong>
                    <small>
                      {cell.status === "ready"
                        ? `${cell.returned} / ${cell.eligible}`
                        : cell.returned
                          ? cell.returned + tr("admin.events.adminEventsPanels.returnsRecorded")
                          : "—"}
                    </small>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!cohorts.length && (
        <p className="businessNoCohort">
          {data
            ? tr("admin.events.adminEventsPanels.noNewUsersRegisteredInThese")
            : tr("admin.events.adminEventsPanels.waitingForRealRegistrationCohorts")}
        </p>
      )}
      {cohorts.length > 7 && (
        <div className="businessPager">
          <span>
            {page * 7 + 1}–{Math.min(page * 7 + 7, cohorts.length)} / {cohorts.length}{" "}
            {tr("admin.events.adminEventsPanels.cohorts")}
          </span>
          <button disabled={!page} onClick={() => setPage((value) => value - 1)}>
            {tr("admin.events.adminEventsPanels.newer")}
          </button>
          <button
            disabled={(page + 1) * 7 >= cohorts.length}
            onClick={() => setPage((value) => value + 1)}
          >
            {tr("admin.events.adminEventsPanels.older")}
          </button>
        </div>
      )}
      <p className="businessFootnote">
        {tr("admin.events.adminEventsPanels.onlyFullyObservedReturnDaysEnter")}
      </p>
    </section>
  );
}
