import { useI18n } from "../../hooks/use-i18n.js";
import { useConnectTrial } from "../../hooks/dashboard/use-connect-trial.js";

/** The person's button for the one-off Connect trial, with the reason when it cannot start. */
export function ConnectTrialButton({
  trialDays,
  className,
  onStarted,
}: {
  trialDays: number;
  className?: string;
  onStarted: () => unknown;
}) {
  const { tr } = useI18n(),
    { start, busy, refusal } = useConnectTrial(onStarted);
  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => void start()}>
        {busy
          ? tr("billing.connectTrial.starting")
          : tr("billing.connectTrial.start", { trialDays })}
      </button>
      {refusal && (
        <small role="alert">
          {tr(
            refusal === "shared_computer"
              ? "billing.connectTrial.refusedSharedComputer"
              : refusal === "not_needed"
                ? "billing.connectTrial.refusedNotNeeded"
                : "billing.connectTrial.refused",
            { trialDays },
          )}
        </small>
      )}
    </>
  );
}
