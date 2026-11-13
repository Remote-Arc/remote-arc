import type { Translate } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { ArcVerification, ArcReceipt } from "@remotearc/protocol";
type Tr = Translate;
export const verificationLabel = (scope: ArcVerification, tr: Tr) =>
  scope.kind === "inbox"
    ? tr("arc.chat.arcVerificationUi.readUpToInboxExcerpts", { limit: scope.limit })
    : scope.kind === "github_issue"
      ? tr("arc.chat.arcVerificationUi.createAndReadBackAnIssue", { repo: scope.repo })
      : tr("arc.chat.arcVerificationUi.checkDeployment", { deploymentId: scope.deploymentId });
export function ArcVerificationScope({ scope, tr }: { scope: ArcVerification; tr: Tr }) {
  return (
    <details className="arcVerificationScope">
      <summary>
        {tr("arc.chat.arcVerificationUi.verificationScope")} · {verificationLabel(scope, tr)}
      </summary>
      <dl>
        <dt>{tr("arc.chat.arcVerificationUi.accountConnection")}</dt>
        <dd>
          <code>{scope.connectionId}</code>
        </dd>
        {scope.kind === "github_issue" ? (
          <>
            <dt>{tr("arc.chat.arcVerificationUi.title")}</dt>
            <dd>{scope.title}</dd>
            <dt>{tr("arc.chat.arcVerificationUi.body")}</dt>
            <dd className="arcVerificationBody">{scope.body}</dd>
          </>
        ) : scope.kind === "inbox" ? (
          <>
            <dt>{tr("arc.chat.arcVerificationUi.query")}</dt>
            <dd>{scope.query || tr("arc.chat.arcVerificationUi.inboxRecentMessages")}</dd>
          </>
        ) : scope.teamId ? (
          <>
            <dt>{tr("arc.chat.arcVerificationUi.team")}</dt>
            <dd>{scope.teamId}</dd>
          </>
        ) : null}
      </dl>
    </details>
  );
}
const checkLabel = (code: string, tr: Tr) =>
  ({
    inbox_excerpts_read: tr("arc.chat.arcVerificationUi.requestedMessageBodiesWereRead"),
    issue_acknowledged: tr("arc.chat.arcVerificationUi.providerAcknowledgedTheIssue"),
    issue_readback_matches: tr("arc.chat.arcVerificationUi.readBackTitleAndBodyMatch"),
    deployment_ready: tr("arc.chat.arcVerificationUi.exactDeploymentIsReadyWithA"),
  })[code] || code;
export function ArcRunReceipt({ receipt, tr }: { receipt: ArcReceipt; tr: Tr }) {
  const title = {
    completed: tr("arc.chat.arcVerificationUi.declaredChecksPassed"),
    partial: tr("arc.chat.arcVerificationUi.partiallyCompleted"),
    pending_verification: tr("arc.chat.arcVerificationUi.pendingVerification"),
    failed: tr("arc.chat.arcVerificationUi.verificationIncomplete"),
  }[receipt.status];
  const next = {
    none: tr("arc.chat.arcVerificationUi.reviewTheEvidenceWhenYouNeed"),
    inspect_before_retry: tr("arc.chat.arcVerificationUi.inspectTheLastActionBeforeRepeating"),
    review_remaining: tr("arc.chat.arcVerificationUi.reviewTheAcknowledgedChangesAndThe"),
    verify_result: tr("arc.chat.arcVerificationUi.checkTheActualResultBeforeRelying"),
  }[receipt.next];
  return (
    <section
      className="arcRunReceipt"
      data-state={receipt.status}
      aria-label={tr("arc.chat.arcVerificationUi.executionReceipt")}
    >
      <strong>{title}</strong>
      {receipt.scope ? (
        <>
          <p>{verificationLabel(receipt.scope, tr)}</p>
          <ul>
            {receipt.checks.map((check) => (
              <li key={check.code}>
                <span>
                  {check.status === "passed" ? "✓" : check.status === "failed" ? "!" : "○"}{" "}
                  {checkLabel(check.code, tr)}
                </span>
                <small>
                  {check.status === "passed"
                    ? tr("arc.chat.arcVerificationUi.passed")
                    : check.status === "failed"
                      ? tr("arc.chat.arcVerificationUi.failed")
                      : tr("arc.chat.arcVerificationUi.pending")}
                </small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{tr("arc.chat.arcVerificationUi.theRunEndedNoExplicitGoal")}</p>
      )}
      <p>
        {receipt.changes.length
          ? tr("arc.chat.arcVerificationUi.acknowledgedChangeS", { length: receipt.changes.length })
          : tr("arc.chat.arcVerificationUi.noAcknowledgedAppWritesInThis")}{" "}
        {next}
      </p>
      {receipt.scope?.kind === "inbox" && (
        <p>{tr("arc.chat.arcVerificationUi.checksCoverSourceRetrievalSummaryAccuracy")}</p>
      )}
      {receipt.scope?.kind === "github_issue" &&
        receipt.changes.length > 0 &&
        receipt.status !== "completed" && (
          <p>{tr("arc.chat.arcVerificationUi.theIssueMayRemainOpenInspect")}</p>
        )}
      <details>
        <summary>
          {tr("arc.chat.arcVerificationUi.evidenceAndChanges")} · {receipt.evidence.length}
        </summary>
        {receipt.evidence.map((item) => (
          <div className="arcReceiptEvidence" key={item.id}>
            <code>{item.tool}</code> · <span>{item.status}</span>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.resource || tr("arc.chat.arcVerificationUi.openResult")}
              </a>
            )}
            <small>
              {item.observedAt} · {item.id}
            </small>
            {receipt.changes
              .filter((change) => change.evidenceId === item.id)
              .map((change) => (
                <small key={change.operation}>
                  {change.operation} · {change.target}
                </small>
              ))}
          </div>
        ))}
      </details>
    </section>
  );
}
type Connection = { id: string; provider: string; accountLabel: string; status: string };
type FormProps = {
  connections: Connection[];
  tr: Tr;
  busy: boolean;
  onRun: (scope: ArcVerification) => Promise<void>;
};
export function ArcVerifiedTaskForm({ connections, tr, busy, onRun }: FormProps) {
  const prefix = useId(),
    [kind, setKind] = useState<ArcVerification["kind"]>("inbox"),
    [connection, setConnection] = useState(""),
    [formError, setFormError] = useState("");
  const [repo, setRepo] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(5),
    [deploymentId, setDeploymentId] = useState(""),
    [teamId, setTeamId] = useState("");
  const choices = connections.filter(
    (c) =>
      c.status === "active" &&
      (kind === "inbox"
        ? ["gmail", "outlook"]
        : kind === "github_issue"
          ? ["github"]
          : ["vercel"]
      ).includes(c.provider),
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !choices.some((c) => c.id === connection)) return;
    if (
      kind === "github_issue" &&
      (!title.trim() || !body || body.length > 4000 || new TextEncoder().encode(body).length > 6000)
    ) {
      setFormError(tr("arc.chat.arcVerificationUi.enterATitleAndBodyUp"));
      return;
    }
    if (kind === "inbox" && (!Number.isInteger(limit) || limit < 1 || limit > 5)) return;
    setFormError("");
    const scope: ArcVerification =
      kind === "inbox"
        ? { kind, connectionId: connection, limit, ...(query ? { query } : {}) }
        : kind === "github_issue"
          ? { kind, connectionId: connection, repo: repo.trim(), title: title.trim(), body }
          : {
              kind,
              connectionId: connection,
              deploymentId: deploymentId.trim(),
              ...(teamId.trim() ? { teamId: teamId.trim() } : {}),
            };
    void onRun(scope);
  }
  return (
    <form className="arcVerifiedTaskForm" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor={prefix + "-kind"}>{tr("arc.chat.arcVerificationUi.task")}</label>
        <select
          id={prefix + "-kind"}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as ArcVerification["kind"]);
            setConnection("");
          }}
        >
          <option value="inbox">{tr("arc.chat.arcVerificationUi.readInboxExcerpts")}</option>
          <option value="github_issue">
            {tr("arc.chat.arcVerificationUi.createAndVerifyAGithubIssue")}
          </option>
          <option value="deployment">
            {tr("arc.chat.arcVerificationUi.verifyDeploymentReadiness")}
          </option>
        </select>
        <label htmlFor={prefix + "-account"}>{tr("arc.chat.arcVerificationUi.account")}</label>
        <select
          id={prefix + "-account"}
          required
          value={connection}
          onChange={(event) => setConnection(event.target.value)}
        >
          <option value="">{tr("arc.chat.arcVerificationUi.chooseAConnectedAccount")}</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.accountLabel} · {c.provider}
            </option>
          ))}
        </select>
        {kind === "inbox" ? (
          <>
            <label htmlFor={prefix + "-limit"}>
              {tr("arc.chat.arcVerificationUi.maximumMessages")}
            </label>
            <input
              id={prefix + "-limit"}
              type="number"
              min={1}
              max={5}
              required
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
            <label htmlFor={prefix + "-query"}>
              {tr("arc.chat.arcVerificationUi.optionalProviderSearch")}
            </label>
            <input
              id={prefix + "-query"}
              maxLength={500}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p>{tr("arc.chat.arcVerificationUi.readsMessageExcerptsOnlyNoSending")}</p>
          </>
        ) : kind === "github_issue" ? (
          <>
            <label htmlFor={prefix + "-repo"}>
              {tr("arc.chat.arcVerificationUi.repositoryOwnerRepo")}
            </label>
            <input
              id={prefix + "-repo"}
              required
              maxLength={200}
              pattern="[\w.\-]+/[\w.\-]+"
              value={repo}
              onChange={(event) => setRepo(event.target.value)}
            />
            <label htmlFor={prefix + "-title"}>
              {tr("arc.chat.arcVerificationUi.exactIssueTitle")}
            </label>
            <input
              id={prefix + "-title"}
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor={prefix + "-body"}>
              {tr("arc.chat.arcVerificationUi.exactIssueBody")}
            </label>
            <textarea
              id={prefix + "-body"}
              required
              maxLength={4000}
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <p>{tr("arc.chat.arcVerificationUi.createsOneIssueWithTheseExact")}</p>
          </>
        ) : (
          <>
            <label htmlFor={prefix + "-deployment"}>
              {tr("arc.chat.arcVerificationUi.deploymentId")}
            </label>
            <input
              id={prefix + "-deployment"}
              required
              maxLength={160}
              pattern="[\w.\-]+"
              value={deploymentId}
              onChange={(event) => setDeploymentId(event.target.value)}
            />
            <label htmlFor={prefix + "-team"}>
              {tr("arc.chat.arcVerificationUi.optionalTeamId")}
            </label>
            <input
              id={prefix + "-team"}
              maxLength={160}
              pattern="[\w.\-]+"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            />
            <p>{tr("arc.chat.arcVerificationUi.readsThisVercelDeploymentOnlyReady")}</p>
          </>
        )}
        {formError && <p role="alert">{formError}</p>}
        <button type="submit" disabled={!connection || busy}>
          {busy
            ? tr("arc.chat.arcVerificationUi.starting")
            : kind === "github_issue"
              ? tr("arc.chat.arcVerificationUi.createIssueAndVerify")
              : tr("arc.chat.arcVerificationUi.runVerification")}
        </button>
      </fieldset>
    </form>
  );
}
export function ArcVerifiedTaskLauncher({
  accountId,
  disabled,
  onSend,
  onManageApps,
  tr,
  errorMessage,
}: {
  accountId: string;
  disabled: boolean;
  onSend: (text: string, scope: ArcVerification) => Promise<boolean>;
  onManageApps: () => void;
  tr: Tr;
  errorMessage?: string;
}) {
  const [open, setOpen] = useState(false),
    [connections, setConnections] = useState<Connection[] | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    titleId = useId();
  useEffect(() => {
    setOpen(false);
    setConnections(null);
    setError(false);
  }, [accountId]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setConnections(null);
    setError(false);
    dialog.current?.showModal();
    void fetch("/api/apps", {
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json().then(canonicalErrorEnvelope);
      })
      .then((data) => {
        if (!controller.signal.aborted) setConnections(data.connections || []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [open, accountId]);
  function close() {
    if (busy) return;
    setOpen(false);
    trigger.current?.focus();
  }
  async function run(scope: ArcVerification) {
    setBusy(true);
    try {
      const text =
        scope.kind === "inbox"
          ? tr("arc.chat.arcVerificationUi.readTheInboxExcerptsInThe")
          : scope.kind === "github_issue"
            ? tr("arc.chat.arcVerificationUi.createTheExactGithubIssueIn")
            : tr("arc.chat.arcVerificationUi.checkTheExactDeploymentInThe");
      if (await onSend(text, scope)) setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="arcVerifiedTaskLauncher">
      <button ref={trigger} type="button" disabled={disabled} onClick={() => setOpen(true)}>
        {tr("arc.chat.arcVerificationUi.verifiedTask")}
      </button>
      {open && (
        <dialog
          className="arcVerifiedDialog"
          ref={dialog}
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div className="arcVerifiedDialogHeader">
            <h2 id={titleId}>{tr("arc.chat.arcVerificationUi.chooseTheResultToVerify")}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={close}
              aria-label={tr("arc.chat.arcVerificationUi.close")}
            >
              ×
            </button>
          </div>
          <p>{tr("arc.chat.arcVerificationUi.reviewTheAccountAndExactAction")}</p>
          {error ? (
            <p role="alert">{tr("arc.chat.arcVerificationUi.couldNotLoadAccountsCloseAnd")}</p>
          ) : connections ? (
            <ArcVerifiedTaskForm
              connections={connections}
              tr={tr}
              busy={busy || disabled}
              onRun={run}
            />
          ) : (
            <WorkspaceLoading
              label={tr("arc.chat.arcVerificationUi.loadingAccounts")}
              variant="rows"
            />
          )}
          {errorMessage && <p role="alert">{errorMessage}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              close();
              onManageApps();
            }}
          >
            {tr("arc.chat.arcVerificationUi.manageAppConnections")}
          </button>
        </dialog>
      )}
    </div>
  );
}
