import type { Translate } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { useRef, useState, useEffect } from "react";
import type { ArcEmployeeDraft, ArcEmployee } from "@remotearc/protocol";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { EmployeeEditor, EmployeeAvatar, type EmployeeEditorData } from "./arc-teams-page.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import "../../../styles/arc/teams/arc-employee-draft.css";
type Tr = Translate;
export function ArcEmployeeDraftCard({ draft, tr }: { draft: ArcEmployeeDraft; tr: Tr }) {
  const [updated, setUpdated] = useState<ArcEmployeeDraft | null>(null),
    [data, setData] = useState<EmployeeEditorData | null>(null),
    [review, setReview] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const live = useRef(true);
  useRef(crypto.randomUUID());
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const current = draft.status === "pending" ? updated || draft : draft,
    profile = current.profile;
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await arcRequest<{ draft: ArcEmployeeDraft }>("employee-drafts/" + current.id, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", profile }),
      });
      if (live.current) setUpdated(value.draft);
    } catch {
      if (live.current) setError(tr("arc.teams.arcEmployeeDraft.couldNotCreateThisAgentYour"));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!review) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      arcRequest<EmployeeEditorData["service"]>("status", undefined, controller.signal),
      arcRequest<{ teams: EmployeeEditorData["teams"] }>("teams", undefined, controller.signal),
      arcRequest<{ skills: EmployeeEditorData["skills"] }>("skills", undefined, controller.signal),
      fetch("/api/apps", { credentials: "same-origin", signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw Error("APPS_UNAVAILABLE");
          return response.json().then(canonicalErrorEnvelope);
        },
      ),
      fetch("/api/devices", { credentials: "same-origin", signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw Error("DEVICES_UNAVAILABLE");
          return response.json().then(canonicalErrorEnvelope);
        },
      ),
    ])
      .then(([service, teams, skills, apps, devices]) => {
        if (!controller.signal.aborted)
          setData({
            service,
            teams: teams.teams,
            skills: skills.skills,
            connections: apps.connections,
            devices: Array.isArray(devices) ? devices : devices.devices || [],
            resourceWarning: false,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setReview(false);
          setError(tr("arc.teams.arcEmployeeDraft.couldNotLoadYourModelsAnd"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [review, tr]);
  async function cancel() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await arcRequest<{ draft: ArcEmployeeDraft }>("employee-drafts/" + current.id, {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      });
      if (live.current) setUpdated(value.draft);
    } catch {
      if (live.current) setError(tr("arc.teams.arcEmployeeDraft.couldNotCancelYourDraftIs"));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }

  if (current.status === "confirmed")
    return (
      <div
        className="arcCreatedTeammate"
        aria-label={tr("arc.teams.arcEmployeeDraft.createdAgent")}
      >
        <EmployeeAvatar employee={profile} size={28} />
        <div>
          <strong>{profile.name}</strong>
          <span>{profile.responsibility}</span>
        </div>
        <small>{tr("arc.teams.arcEmployeeDraft.created")}</small>
      </div>
    );
  return (
    <section
      className="arcEmployeeDraft"
      aria-label={tr("arc.teams.arcEmployeeDraft.agentProfile")}
      data-status={current.status}
    >
      <header>
        <EmployeeAvatar employee={profile} size={42} />
        <div>
          <span>
            {current.status === "pending"
              ? tr("arc.teams.arcEmployeeDraft.agentProfile")
              : current.status === "expired"
                ? tr("arc.teams.arcEmployeeDraft.draftExpired")
                : tr("arc.teams.arcEmployeeDraft.draftCancelled")}
          </span>
          <h3>{profile.name}</h3>
        </div>
      </header>
      <p>{profile.responsibility}</p>
      <dl>
        <div>
          <dt>{tr("arc.teams.arcEmployeeDraft.model")}</dt>
          <dd>{profile.modelId === "auto" ? "Auto" : profile.modelId}</dd>
        </div>
        <div>
          <dt>{tr("arc.teams.arcEmployeeDraft.access")}</dt>
          <dd>
            {profile.scope.connectionIds.length || profile.scope.deviceIds.length
              ? tr("arc.teams.arcEmployeeDraft.appsComputers", {
                  length: profile.scope.connectionIds.length,
                  length2: profile.scope.deviceIds.length,
                })
              : tr("arc.teams.arcEmployeeDraft.noAppsOrComputersAssigned")}
          </dd>
        </div>
      </dl>
      {current.status === "pending" && (
        <p className="arcEmployeeDraftNote">
          {tr("arc.teams.arcEmployeeDraft.createThisAgentNowOrEdit")}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        {current.status === "pending" ? (
          <>
            <button
              type="button"
              className="ghostButton"
              disabled={busy || loading}
              onClick={() => void create()}
            >
              {busy
                ? tr("arc.teams.arcEmployeeDraft.creating")
                : tr("arc.teams.arcEmployeeDraft.createAgent")}
            </button>
            <button
              type="button"
              className="ghostButton"
              disabled={busy || loading}
              onClick={() => {
                setData(null);
                setReview(true);
              }}
            >
              {tr("arc.teams.arcEmployeeDraft.editProfile")}
            </button>
            <button type="button" disabled={busy || loading} onClick={() => void cancel()}>
              {tr("arc.teams.arcEmployeeDraft.cancelDraft")}
            </button>
          </>
        ) : null}
        <a href="/dashboard/agent/settings?section=teammates">
          {tr("arc.teams.arcEmployeeDraft.agentSettings")} ↗
        </a>
      </footer>
      {loading && (
        <WorkspaceLoading label={tr("arc.teams.arcEmployeeDraft.loadingProfileOptions")} />
      )}{" "}
      {review && data && (
        <EmployeeEditor
          initial={null}
          initialProfile={profile}
          data={data}
          tr={tr}
          onClose={() => setReview(false)}
          onSaved={() => setReview(false)}
          onCreate={async (profile) => {
            const value = await arcRequest<{ draft: ArcEmployeeDraft; employee: ArcEmployee }>(
              "employee-drafts/" + current.id,
              { method: "POST", body: JSON.stringify({ action: "confirm", profile }) },
            );
            if (live.current) setUpdated(value.draft);
          }}
        />
      )}
    </section>
  );
}
