import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/tasks/planned-goal.css";
import type { PlannedDraft } from "./planned-goal-form.js";
export function PlannedGoalEditor({
  value: d,
  onChange,
}: {
  value: PlannedDraft;
  onChange: (v: PlannedDraft) => void;
}) {
  const { tr } = useI18n();
  const set = <K extends keyof PlannedDraft>(key: K, v: PlannedDraft[K]) =>
    onChange({ ...d, [key]: v });
  const phaseSet = (i: number, field: string, value: unknown) =>
    set(
      "phases",
      d.phases.map((p, j) => (j === i ? { ...p, [field]: value } : p)),
    );
  return (
    <fieldset className="plannedEditor automationFieldWide">
      <legend>{tr("tasks.plannedGoalView.planSettings")}</legend>
      <label className="plannedToggle">
        <input
          type="checkbox"
          checked={d.enabled}
          onChange={(e) => set("enabled", e.target.checked)}
        />
        {tr("tasks.plannedGoalView.customizePhasesPrioritiesAndQualityChecks")}
      </label>
      {!d.enabled && <p>{tr("tasks.plannedGoalView.theExecutorPlansFromYourObjective")}</p>}
      {d.enabled && (
        <>
          <p>{tr("tasks.plannedGoalView.savedCommandSlicesCanContinueAfter")}</p>
          <div className="plannedFields">
            <label>
              <span>{tr("tasks.plannedGoalView.planningMode")}</span>
              <select
                value={d.mode}
                onChange={(e) => set("mode", e.target.value as PlannedDraft["mode"])}
              >
                <option value="fixed">{tr("tasks.plannedGoalView.fixedPhases")}</option>
                <option value="guided">{tr("tasks.plannedGoalView.guidedByPriorities")}</option>
                <option value="autonomous">{tr("tasks.plannedGoalView.planFromTheGoal")}</option>
              </select>
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.minimumUsefulTimeMinutes")}</span>
              <input
                type="number"
                min="1"
                value={d.minMinutes}
                onChange={(e) => set("minMinutes", e.target.value)}
              />
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.maximumTimeMinutes")}</span>
              <input
                type="number"
                min="1"
                value={d.maxMinutes}
                onChange={(e) => set("maxMinutes", e.target.value)}
              />
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.stopAtYourLocalTime")}</span>
              <input
                type="datetime-local"
                value={d.endAt}
                onChange={(e) => set("endAt", e.target.value)}
              />
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.finalizationReserveMinutes")}</span>
              <input
                type="number"
                min="0"
                value={d.reserveMinutes}
                onChange={(e) => set("reserveMinutes", e.target.value)}
              />
            </label>
          </div>
          <small>{tr("tasks.plannedGoalView.theEarliestLimitWinsMinimumTime")}</small>
          <label className="plannedWide">
            <span>{tr("tasks.plannedGoalView.prioritiesOnePerLine")}</span>
            <textarea
              rows={3}
              value={d.priorities}
              maxLength={12000}
              onChange={(e) => set("priorities", e.target.value)}
            />
          </label>
          <div className="plannedPhases">
            <h3>{tr("tasks.plannedGoalView.phases")}</h3>
            {d.phases.map((p, i) => (
              <fieldset key={p.id}>
                <legend>
                  {tr("tasks.plannedGoalView.phase")} {i + 1}
                </legend>
                <label>
                  <span>{tr("tasks.plannedGoalView.objective")}</span>
                  <input
                    value={p.objective}
                    maxLength={2000}
                    onChange={(e) => phaseSet(i, "objective", e.target.value)}
                  />
                </label>
                <label>
                  <span>{tr("tasks.plannedGoalView.successCriteria")}</span>
                  <textarea
                    rows={2}
                    value={p.criteria}
                    maxLength={2000}
                    onChange={(e) => phaseSet(i, "criteria", e.target.value)}
                  />
                </label>
                <div className="plannedFields">
                  <label>
                    <span>{tr("tasks.plannedGoalView.minimumMinutes")}</span>
                    <input
                      type="number"
                      min="1"
                      value={p.minMinutes}
                      onChange={(e) => phaseSet(i, "minMinutes", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>{tr("tasks.plannedGoalView.maximumMinutes")}</span>
                    <input
                      type="number"
                      min="1"
                      value={p.maxMinutes}
                      onChange={(e) => phaseSet(i, "maxMinutes", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  <span>{tr("tasks.plannedGoalView.verificationCommandOptional")}</span>
                  <textarea
                    rows={2}
                    value={p.verify}
                    maxLength={4000}
                    onChange={(e) => phaseSet(i, "verify", e.target.value)}
                  />
                </label>
                <label>
                  <span>{tr("tasks.plannedGoalView.authorizedDeterministicCommandOptional")}</span>
                  <textarea
                    rows={2}
                    value={p.command}
                    maxLength={4000}
                    onChange={(e) => phaseSet(i, "command", e.target.value)}
                  />
                </label>
                {i > 0 && (
                  <div className="plannedDependencies">
                    <span>{tr("tasks.plannedGoalView.requiresCompletedPhases")}</span>
                    {d.phases.slice(0, i).map((prior) => (
                      <label key={prior.id}>
                        <input
                          type="checkbox"
                          checked={p.dependsOn.includes(prior.id)}
                          onChange={(e) =>
                            phaseSet(
                              i,
                              "dependsOn",
                              e.target.checked
                                ? [...p.dependsOn, prior.id]
                                : p.dependsOn.filter((x) => x !== prior.id),
                            )
                          }
                        />
                        {prior.objective || prior.id}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() =>
                    set(
                      "phases",
                      d.phases
                        .filter((x) => x.id !== p.id)
                        .map((x) => ({ ...x, dependsOn: x.dependsOn.filter((id) => id !== p.id) })),
                    )
                  }
                >
                  {tr("tasks.plannedGoalView.removePhase")}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="ghostButton"
              disabled={d.phases.length >= 24}
              onClick={() =>
                set("phases", [
                  ...d.phases,
                  {
                    id: "phase-" + crypto.randomUUID().slice(0, 8),
                    objective: "",
                    criteria: "",
                    verify: "",
                    minMinutes: "",
                    maxMinutes: "",
                    dependsOn: [],
                    command: "",
                  },
                ])
              }
            >
              + {tr("tasks.plannedGoalView.addPhase")}
            </button>
          </div>
          <label className="plannedToggle">
            <input
              type="checkbox"
              checked={d.quality}
              onChange={(e) => set("quality", e.target.checked)}
            />
            {tr("tasks.plannedGoalView.promoteOnlyAfterRequiredChecksPass")}
          </label>
          {d.quality && (
            <div className="plannedQuality">
              <p>{tr("tasks.plannedGoalView.requiresACleanGitRepositoryRoot")}</p>
              {d.checks.map((c, i) => (
                <div className="plannedCheck" key={i}>
                  <label>
                    <span>{tr("tasks.plannedGoalView.checkName")}</span>
                    <input
                      value={c.name}
                      maxLength={80}
                      onChange={(e) =>
                        set(
                          "checks",
                          d.checks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>{tr("tasks.plannedGoalView.command")}</span>
                    <textarea
                      rows={2}
                      value={c.command}
                      maxLength={4000}
                      onChange={(e) =>
                        set(
                          "checks",
                          d.checks.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghostButton"
                    disabled={d.checks.length === 1}
                    onClick={() =>
                      set(
                        "checks",
                        d.checks.filter((_, j) => j !== i),
                      )
                    }
                  >
                    {tr("tasks.plannedGoalView.remove")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghostButton"
                disabled={d.checks.length >= 8}
                onClick={() => set("checks", [...d.checks, { name: "", command: "" }])}
              >
                + {tr("tasks.plannedGoalView.addCheck")}
              </button>
            </div>
          )}
          <label className="plannedToggle">
            <input
              type="checkbox"
              checked={d.continueWork}
              onChange={(e) => set("continueWork", e.target.checked)}
            />
            {tr("tasks.plannedGoalView.lookForValuableSafeWorkAfter")}
          </label>
          <div className="plannedFields">
            <label>
              <span>{tr("tasks.plannedGoalView.sameFailureLimit")}</span>
              <input
                type="number"
                min="1"
                max="20"
                value={d.sameFailure}
                onChange={(e) => set("sameFailure", e.target.value)}
              />
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.noProgressTurnLimit")}</span>
              <input
                type="number"
                min="1"
                max="100"
                value={d.noProgress}
                onChange={(e) => set("noProgress", e.target.value)}
              />
            </label>
            <label>
              <span>{tr("tasks.plannedGoalView.strategyRetryLimit")}</span>
              <input
                type="number"
                min="0"
                max="10"
                value={d.retries}
                onChange={(e) => set("retries", e.target.value)}
              />
            </label>
          </div>
        </>
      )}
    </fieldset>
  );
}
type Result = {
  id: string;
  outcome: string;
  spent_seconds: number;
  evidence: string;
  blocker?: string;
  remaining_work: string;
  checkpoint?: string;
};
export type PlannedProgress = {
  active_phase?: string;
  started_at: string;
  finished_at?: string;
  finalizing?: boolean;
  needs_reasoning?: string;
  plan: {
    phases: { id: string; objective: string }[];
    time_policy: { max_duration_seconds?: number; end_at?: string };
  };
  outcomes: Result[];
  green_frontier?: { checkpoint: string; at: string };
  candidate?: { status: string; evidence?: string; path?: string };
  checks: { name: string; passed: boolean; exit_code: number | null; evidence: string }[];
  rejected: { evidence: string; path?: string }[];
  workspace?: { path: string };
  report?: unknown;
};
export function PlannedGoalProgress({
  value: p,
  expiresAt,
}: {
  value: PlannedProgress;
  expiresAt: string | null;
}) {
  const { tr, locale } = useI18n();
  const bounds = [
    p.plan.time_policy.end_at,
    expiresAt,
    p.plan.time_policy.max_duration_seconds
      ? new Date(
          Date.parse(p.started_at) + p.plan.time_policy.max_duration_seconds * 1000,
        ).toISOString()
      : undefined,
  ].filter(Boolean) as string[];
  const deadline = bounds.length ? new Date(Math.min(...bounds.map(Date.parse))) : null;
  const active = p.plan.phases.find((x) => x.id === p.active_phase);
  const outcome = (s: string) =>
    ({
      completed: tr("tasks.plannedGoalView.accepted"),
      partial: tr("tasks.plannedGoalView.partial"),
      blocked: tr("tasks.plannedGoalView.blocked"),
      failed: tr("tasks.plannedGoalView.failed"),
      skipped: tr("tasks.plannedGoalView.skipped"),
    })[s] || s;
  return (
    <section className="plannedProgress">
      <h3>
        {p.finished_at
          ? tr("tasks.plannedGoalView.finalizedInspectTheOutcome")
          : p.needs_reasoning
            ? tr("tasks.plannedGoalView.sourceReasoningNeeded")
            : p.finalizing
              ? tr("tasks.plannedGoalView.finalizing")
              : tr("tasks.plannedGoalView.planProgress")}
      </h3>
      <div className="plannedSummary">
        <div>
          <span>{tr("tasks.plannedGoalView.currentPhase")}</span>
          <strong>{active?.objective || tr("tasks.plannedGoalView.noActivePhase")}</strong>
        </div>
        <div>
          <span>{tr("tasks.plannedGoalView.acceptedPhases")}</span>
          <strong>
            {p.outcomes.filter((x) => x.outcome === "completed").length} / {p.plan.phases.length}
          </strong>
        </div>
        <div>
          <span>{tr("tasks.plannedGoalView.elapsed")}</span>
          <strong>
            {Math.max(
              0,
              Math.floor(
                ((p.finished_at ? Date.parse(p.finished_at) : Date.now()) -
                  Date.parse(p.started_at)) /
                  60000,
              ),
            )}{" "}
            {tr("tasks.plannedGoalView.min")}
          </strong>
        </div>
        <div>
          <span>{tr("tasks.plannedGoalView.deadline")}</span>
          <strong>
            {deadline?.toLocaleString(locale === "zh" ? "zh-CN" : "en-US") ||
              tr("tasks.plannedGoalView.taskExpiryApplies")}
          </strong>
        </div>
      </div>
      {p.needs_reasoning && <p className="plannedReason">{p.needs_reasoning}</p>}
      <p>
        <strong>{tr("tasks.plannedGoalView.acceptedCheckpoint")}: </strong>
        <code>
          {p.green_frontier?.checkpoint || tr("tasks.plannedGoalView.noVerifiedBaselineYet")}
        </code>
      </p>
      {p.candidate && (
        <p>
          <strong>{tr("tasks.plannedGoalView.candidate")}: </strong>
          {{
            working: tr("tasks.plannedGoalView.inProgress"),
            evaluating: tr("tasks.plannedGoalView.checking"),
            accepted: tr("tasks.plannedGoalView.accepted"),
            rejected: tr("tasks.plannedGoalView.rejectedFrontierRetained"),
            unknown: tr("tasks.plannedGoalView.outcomeUnknownInspectionNeeded"),
          }[p.candidate.status] || p.candidate.status}
          {p.candidate.evidence && <span className="plannedEvidence">{p.candidate.evidence}</span>}
        </p>
      )}
      {p.workspace && (
        <p className="plannedWorkspace">
          {tr("tasks.plannedGoalView.taskWorktree")}: <code>{p.workspace.path}</code>
          <br />
          {tr("tasks.plannedGoalView.acceptedWorkRequiresReviewBeforeApplying")}
        </p>
      )}
      {!!p.checks.length && (
        <div className="plannedChecks">
          <h4>{tr("tasks.plannedGoalView.latestQualityResults")}</h4>
          {p.checks.map((c, i) => (
            <details key={i}>
              <summary>
                <strong>{c.name}</strong>
                <span>
                  {c.passed
                    ? tr("tasks.plannedGoalView.passed")
                    : tr("tasks.plannedGoalView.notPassed")}{" "}
                  · {tr("tasks.plannedGoalView.exit")} {c.exit_code ?? "—"}
                </span>
              </summary>
              <pre>{c.evidence}</pre>
            </details>
          ))}
        </div>
      )}
      <div className="plannedHistory">
        <h4>{tr("tasks.plannedGoalView.phaseOutcomes")}</h4>
        {p.plan.phases.map((phase) => {
          const r = p.outcomes.find((x) => x.id === phase.id);
          return (
            <details key={phase.id}>
              <summary>
                <strong>{phase.objective}</strong>
                <span>
                  {r
                    ? outcome(r.outcome)
                    : phase.id === p.active_phase
                      ? tr("tasks.plannedGoalView.active")
                      : tr("tasks.plannedGoalView.untouched")}
                </span>
              </summary>
              {r && (
                <>
                  <p>{r.evidence}</p>
                  {r.blocker && (
                    <p>
                      {tr("tasks.plannedGoalView.blocker")}: {r.blocker}
                    </p>
                  )}
                  {r.remaining_work && (
                    <p>
                      {tr("tasks.plannedGoalView.remaining")}: {r.remaining_work}
                    </p>
                  )}
                  <p>
                    {Math.round(r.spent_seconds / 60)} {tr("tasks.plannedGoalView.min")}
                    {r.checkpoint && (
                      <>
                        {" "}
                        · <code>{r.checkpoint}</code>
                      </>
                    )}
                  </p>
                </>
              )}
            </details>
          );
        })}
      </div>
      {!!p.rejected.length && (
        <details>
          <summary>
            {tr("tasks.plannedGoalView.rejectedAttempts")} ({p.rejected.length})
          </summary>
          {p.rejected.map((r, i) => (
            <div key={i}>
              <p>{r.evidence}</p>
              {r.path && <code>{r.path}</code>}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
