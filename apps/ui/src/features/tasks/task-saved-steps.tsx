import type { Translate } from "../../locales/locale-catalog.js";
import { useI18n } from "../../hooks/use-i18n.js";

export type StepCondition = {
  step: number;
  exit_code?: number;
  output_contains?: string;
  output_matches?: string;
  not?: boolean;
};

export type SavedStep = {
  type?: string;
  command?: string;
  cwd?: string;
  run_if?: StepCondition;
  accept_exit_codes?: number[];
};

const RUN_IF = {
  exit: "tasks.taskSavedSteps.runIfExitCode",
  exitNot: "tasks.taskSavedSteps.runIfExitCodeNot",
  contains: "tasks.taskSavedSteps.runIfContains",
  containsNot: "tasks.taskSavedSteps.runIfContainsNot",
  matches: "tasks.taskSavedSteps.runIfMatches",
  matchesNot: "tasks.taskSavedSteps.runIfMatchesNot",
} as const;

/** One sentence for when a step runs, from its saved run_if. */
export function describeStepCondition(condition: StepCondition, tr: Translate) {
  const step = condition.step;
  if (condition.exit_code !== undefined)
    return tr(condition.not ? RUN_IF.exitNot : RUN_IF.exit, { step, code: condition.exit_code });
  if (condition.output_contains !== undefined)
    return tr(condition.not ? RUN_IF.containsNot : RUN_IF.contains, {
      step,
      text: condition.output_contains,
    });
  return tr(condition.not ? RUN_IF.matchesNot : RUN_IF.matches, {
    step,
    pattern: condition.output_matches || "",
  });
}

function StepCommand({ step, label }: { step: SavedStep; label: string }) {
  const { tr } = useI18n();
  if (!step.command) return <p>{step.type}</p>;
  return (
    <div className="taskSavedStep">
      <p className="taskSavedStepHead">
        {label && (
          <>
            <strong>{label}</strong> ·{" "}
          </>
        )}
        {tr("tasks.dashboardTaskView.shellCommandExecutedVerbatim")}
        {step.cwd ? ` · ${step.cwd}` : ""}
      </p>
      {step.run_if && <p className="taskSavedStepRule">{describeStepCondition(step.run_if, tr)}</p>}
      {step.accept_exit_codes && (
        <p className="taskSavedStepRule">
          {tr("tasks.taskSavedSteps.acceptExitCodes", {
            codes: step.accept_exit_codes.join(", "),
          })}
        </p>
      )}
      <pre>{step.command}</pre>
    </div>
  );
}

/** A command task's saved steps, their run conditions and its on_failure steps. */
export function TaskSavedSteps({
  steps,
  onFailure,
}: {
  steps: SavedStep[];
  onFailure?: SavedStep[];
}) {
  const { tr } = useI18n();
  const numbered = steps.length > 1 || Boolean(onFailure?.length);
  return (
    <>
      {steps.map((step, index) => (
        <StepCommand
          key={index}
          step={step}
          label={numbered ? tr("tasks.taskSavedSteps.step", { n: index + 1 }) : ""}
        />
      ))}
      {onFailure && onFailure.length > 0 && (
        <div className="taskSavedOnFailure">
          <p className="taskSavedStepRule">{tr("tasks.taskSavedSteps.onFailure")}</p>
          {onFailure.map((step, index) => (
            <StepCommand
              key={index}
              step={step}
              label={tr("tasks.taskSavedSteps.cleanupStep", { n: index + 1 })}
            />
          ))}
        </div>
      )}
    </>
  );
}
