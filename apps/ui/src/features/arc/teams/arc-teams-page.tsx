import type { Translate } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import type { ArcMention } from "../../../hooks/arc/use-arc-skill-mentions.js";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  ArcEmployee,
  ArcEmployeeProfile,
  ArcTeam,
  ArcTeamProfile,
  ArcTeamEvent,
  ArcTeamRoom,
} from "@remotearc/protocol";
import { TeamAvatar } from "./arc-team-avatar.js";
import { ArcTeamArchive } from "./arc-team-archive.js";
import { arcRequest, type ChatService } from "../../../hooks/arc/use-arc-chat.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/arc/teams/arc-teams-page.css";
type Tr = Translate;
type Connection = {
  id: string;
  provider: string;
  accountLabel: string;
  status: string;
  permissions: string[];
};
type Device = { id: string; name: string; tools: string[]; status: string };
type Data = {
  accountId: string;
  skills: { id: string; name: string }[];
  rooms: ArcTeamRoom[];
  resourceWarning: boolean;
  employees: ArcEmployee[];
  teams: ArcTeam[];
  events: ArcTeamEvent[];
  service: ChatService;
  connections: Connection[];
  devices: Device[];
};
const emptyProfile = (): ArcEmployeeProfile => ({
  name: "",
  responsibility: "",
  instructions: "",
  modelId: "auto",
  avatar: { kind: "initials", color: "#446655" },
  scope: { appMode: "none", connectionIds: [], deviceIds: [], deviceTools: [], skillIds: [] },
});
const fail = (code: string, tr: Tr) =>
  ({
    ARC_EMPLOYEE_DRAFT_CLOSED: tr("arc.teams.arcTeamsPage.thisDraftHasExpiredOrWas"),
    ARC_EMPLOYEE_DRAFT_CHANGED: tr("arc.teams.arcTeamsPage.thisDraftChangedReopenTheConversation"),
    ARC_TEAM_VERSION_CONFLICT: tr("arc.teams.arcTeamsPage.thisChangedElsewhereReloadTheCurrent"),
    ARC_TEAM_IDEMPOTENCY_CONFLICT: tr("arc.teams.arcTeamsPage.theSavedDraftDiffersReloadBefore"),
    ARC_EMPLOYEE_MODEL_UNAVAILABLE: tr("arc.teams.arcTeamsPage.thisModelIsUnavailableInYour"),
    ARC_EMPLOYEE_SCOPE_UNAVAILABLE: tr("arc.teams.arcTeamsPage.anAppOrComputerPermissionChanged"),
    ARC_TEAM_MEMBER_ARCHIVED: tr("arc.teams.arcTeamsPage.removeArchivedAgentsBeforeSavingThis"),
  })[code] || tr("arc.teams.arcTeamsPage.couldNotSaveThisChangeYour");
export const EmployeeAvatar = TeamAvatar;
export function ArcTeamsPage({
  accountId,
  tr,
  onWork,
}: {
  accountId: string;
  tr: Tr;
  onWork?: (prompt: string, reference?: ArcMention) => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<"" | "load" | "archive">(""),
    [revision, setRevision] = useState(0),
    [view, setView] = useState<"employees" | "teams" | "activity">("employees"),
    [employee, setEmployee] = useState<ArcEmployee | null | undefined>(),
    [team, setTeam] = useState<ArcTeam | null | undefined>(),
    [busy, setBusy] = useState(false);
  // Background saves refresh this account, but can close only the editor that submitted them.
  const generation = useRef(0),
    editorGeneration = useRef(0),
    version = generation.current,
    editorVersion = editorGeneration.current;
  const editorTrigger = useRef<HTMLElement | null>(null);
  const editorFocus = (opening: boolean) => {
    if (typeof document === "undefined") return;
    if (opening) editorTrigger.current = document.activeElement as HTMLElement;
    else
      requestAnimationFrame(() => {
        if (!document.querySelector(".arcTeamDialog[open]") && editorTrigger.current?.isConnected)
          editorTrigger.current.focus();
      });
  };
  const editEmployee = (value: ArcEmployee | null | undefined) => {
    editorGeneration.current++;
    editorFocus(value !== undefined);
    setEmployee(value);
  };
  const editTeam = (value: ArcTeam | null | undefined) => {
    editorGeneration.current++;
    editorFocus(value !== undefined);
    setTeam(value);
  };
  const [search, setSearch] = useState("");
  const roomId = new URLSearchParams(location.search).get("room");
  useEffect(() => {
    generation.current++;
    editorGeneration.current++;
    setData(null);
    setEmployee(undefined);
    setTeam(undefined);
    setError("");
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [accountId]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void Promise.all([
      arcRequest<{ employees: ArcEmployee[] }>("employees", undefined, controller.signal),
      arcRequest<{ teams: ArcTeam[] }>("teams", undefined, controller.signal),
      arcRequest<{ events: ArcTeamEvent[] }>("team-events", undefined, controller.signal),
      arcRequest<ChatService>("status", undefined, controller.signal),
      fetch("/api/apps", { credentials: "same-origin", signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw Error("RESOURCE_UNAVAILABLE");
          return r.json().then(canonicalErrorEnvelope);
        })
        .catch(() => ({ connections: [], unavailable: true })),
      fetch("/api/devices", { credentials: "same-origin", signal: controller.signal })
        .then(async (r) => {
          if (!r.ok) throw Error("RESOURCE_UNAVAILABLE");
          return r.json().then(canonicalErrorEnvelope);
        })
        .catch(() => ({ devices: [], unavailable: true })),
      arcRequest<{ skills: Data["skills"] }>("skills", undefined, controller.signal).catch(() => ({
        skills: [],
        unavailable: true,
      })),
    ])
      .then(([employees, teams, events, service, apps, devices, skills]) => {
        if (!controller.signal.aborted)
          setData({
            accountId,
            employees: employees.employees || [],
            teams: teams.teams || [],
            events: events.events || [],
            service,
            connections: apps.connections || [],
            devices: Array.isArray(devices) ? devices : devices.devices || [],
            skills: skills.skills || [],
            rooms: [],
            resourceWarning: Boolean(
              apps.unavailable || devices.unavailable || "unavailable" in skills,
            ),
          });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load");
      });
    return () => controller.abort();
  }, [accountId, revision]);
  async function archive(kind: "employees" | "teams", item: ArcEmployee | ArcTeam) {
    if (busy) return;
    const version = generation.current;
    setBusy(true);
    setError("");
    try {
      await arcRequest(kind + "/" + encodeURIComponent(item.id), { method: "DELETE" });
      if (generation.current === version) setRevision((v) => v + 1);
    } catch {
      if (generation.current === version) setError("archive");
    } finally {
      if (generation.current === version) setBusy(false);
    }
  }
  const employees = data?.employees.filter((e) => e.status === "active") || [],
    teams = data?.teams.filter((t) => t.status === "active") || [];
  return (
    <section className="arcTeammateSettings">
      <div className="raSettingsSurface arcTeammateIntro">
        <p>{tr("arc.teams.arcTeamsPage.giveArcYourGoalInChat")}</p>
        <a className="raSettingsButton" href="/dashboard/agent/chat">
          {tr("arc.teams.arcTeamsPage.openArcChat")} →
        </a>
      </div>
      {error && (
        <p role="alert">
          {error === "load"
            ? tr("arc.teams.arcTeamsPage.couldNotLoadAgentSettings")
            : tr("arc.teams.arcTeamsPage.couldNotArchiveThisItem")}{" "}
          <button type="button" onClick={() => setRevision((v) => v + 1)}>
            {tr("arc.teams.arcTeamsPage.retry")}
          </button>
        </p>
      )}
      {!data && !error && (
        <WorkspaceLoading label={tr("arc.teams.arcTeamsPage.loadingAgents")} variant="cards" />
      )}
      {data && data.accountId === accountId && (
        <>
          {onWork && (
            <div className="arcTeammateCreate">
              <button type="button" className="raSettingsButton" onClick={() => editEmployee(null)}>
                <Icon name="add" size={15} />
                {tr("arc.teams.arcTeamsPage.addAgent")}
              </button>
              <button
                type="button"
                className="raSettingsButton"
                disabled={!employees.length}
                onClick={() => editTeam(null)}
              >
                {tr("arc.teams.arcTeamsPage.createTeam")}
              </button>
              <button
                type="button"
                className="raSettingsButton"
                onClick={() => onWork(tr("arc.teams.arcTeamsPage.helpMeOrganizeTheAgentsNeeded"))}
              >
                {tr("arc.teams.arcTeamsPage.organizeWithArc")}
              </button>
            </div>
          )}
          <div
            className="arcTeamsTabs"
            role="tablist"
            aria-label={tr("arc.teams.arcTeamsPage.agentSettings")}
          >
            {(["employees", "teams", "activity"] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
              >
                {tab === "employees"
                  ? tr("arc.teams.arcTeamsPage.agents")
                  : tab === "teams"
                    ? tr("arc.teams.arcTeamsPage.savedTeams")
                    : tr("arc.teams.arcTeamsPage.changes")}
              </button>
            ))}
          </div>
          {onWork && view !== "activity" && (
            <label className="arcTeammateSearch">
              {tr("arc.teams.arcTeamsPage.searchRolesAndResponsibilities")}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tr("arc.teams.arcTeamsPage.nameRoleOrPurpose")}
              />
            </label>
          )}
          {view === "activity" ? (
            <div className="arcTeamEvents">
              {data.events.map((event) => {
                const details = event.details as {
                  profile?: { name?: string; responsibility?: string; purpose?: string };
                };
                const name =
                  details.profile?.name ||
                  data.employees.find((e) => e.id === event.employeeId)?.name ||
                  data.teams.find((t) => t.id === event.teamId)?.name ||
                  tr("arc.teams.arcTeamsPage.yourWorkspace");
                return (
                  <article key={event.id}>
                    <div>
                      <strong>{name}</strong>
                      <p>
                        {(
                          {
                            "employee.created": tr("arc.teams.arcTeamsPage.agentAdded"),
                            "employee.updated": tr("arc.teams.arcTeamsPage.agentDetailsUpdated"),
                            "employee.archived": tr("arc.teams.arcTeamsPage.agentArchived"),
                            "team.created": tr("arc.teams.arcTeamsPage.teamOrganized"),
                            "team.updated": tr("arc.teams.arcTeamsPage.teamUpdated"),
                            "team.archived": tr("arc.teams.arcTeamsPage.teamArchived"),
                            "work.assigned": tr(
                              "arc.teams.arcTeamsPage.workAssignedResultsReturnToThe",
                            ),
                          } as Record<string, string>
                        )[event.type] || tr("arc.teams.arcTeamsPage.workspaceUpdated")}
                      </p>
                    </div>
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </article>
                );
              })}
              {!data.events.length && (
                <p>{tr("arc.teams.arcTeamsPage.savedAgentChangesAppearHere")}</p>
              )}
            </div>
          ) : (
            <div className="arcTeamsGrid">
              {view === "employees"
                ? employees
                    .filter((item) =>
                      (item.name + " " + item.responsibility)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((item) => (
                      <article className="arcTeamCard" key={item.id}>
                        {data.service.preview && (
                          <small className="arcTeamPreviewLabel">
                            {tr("arc.teams.arcTeamsPage.previewExample")}
                          </small>
                        )}
                        <EmployeeAvatar employee={item} />
                        <h3>{item.name}</h3>
                        <p>{item.responsibility}</p>
                        {onWork && (
                          <p className="arcTeammateAccess">
                            {item.scope.connectionIds.length} {tr("arc.teams.arcTeamsPage.apps")} ·{" "}
                            {item.scope.deviceIds.length} {tr("arc.teams.arcTeamsPage.computers")} ·{" "}
                            {item.scope.appMode === "write"
                              ? tr("arc.teams.arcTeamsPage.readWrite")
                              : item.scope.appMode === "read"
                                ? tr("arc.teams.arcTeamsPage.readOnly")
                                : tr("arc.teams.arcTeamsPage.noAppAccess")}
                          </p>
                        )}
                        <footer>
                          {onWork ? (
                            <button
                              type="button"
                              className="arcTeammateWork"
                              onClick={() =>
                                onWork("", {
                                  kind: "employee",
                                  id: item.id,
                                  name: item.name,
                                  description: item.responsibility,
                                  avatar: item.avatar,
                                })
                              }
                            >
                              {tr("arc.teams.arcTeamsPage.workWithThisAgent")} →
                            </button>
                          ) : (
                            <a
                              href={"/dashboard/agent/chat?teammate=" + encodeURIComponent(item.id)}
                            >
                              {tr("arc.teams.arcTeamsPage.workWithThisAgent")} →
                            </a>
                          )}
                          <button type="button" onClick={() => editEmployee(item)}>
                            {tr("arc.teams.arcTeamsPage.editDetailsAccess")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void archive("employees", item)}
                          >
                            {tr("arc.teams.arcTeamsPage.archive")}
                          </button>
                        </footer>
                      </article>
                    ))
                : teams
                    .filter((item) =>
                      (item.name + " " + item.purpose).toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((item) => (
                      <article className="arcTeamCard" key={item.id}>
                        <h3>{item.name}</h3>
                        <p>{item.purpose}</p>
                        <small>
                          {item.employeeIds.length} {tr("arc.teams.arcTeamsPage.agents2")}
                        </small>
                        <footer>
                          {onWork && (
                            <button
                              type="button"
                              className="arcTeammateWork"
                              onClick={() =>
                                onWork(
                                  tr("arc.teams.arcTeamsPage.workWithMySavedTeamId", {
                                    name: item.name,
                                    id: item.id,
                                  }),
                                )
                              }
                            >
                              {tr("arc.teams.arcTeamsPage.workWithThisTeam")} →
                            </button>
                          )}
                          <button type="button" onClick={() => editTeam(item)}>
                            {tr("arc.teams.arcTeamsPage.editSavedTeam")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void archive("teams", item)}
                          >
                            {tr("arc.teams.arcTeamsPage.archive")}
                          </button>
                        </footer>
                      </article>
                    ))}
            </div>
          )}
          {onWork &&
            search &&
            view !== "activity" &&
            !(
              view === "employees"
                ? employees.map((item) => item.name + " " + item.responsibility)
                : teams.map((item) => item.name + " " + item.purpose)
            ).some((value) => value.toLowerCase().includes(search.toLowerCase())) && (
              <p role="status">{tr("arc.teams.arcTeamsPage.noMatchingAgentsOrTeamsTry")}</p>
            )}
          {view !== "activity" && !(view === "employees" ? employees : teams).length && (
            <p className="arcCheckoutQuiet">
              {tr("arc.teams.arcTeamsPage.noSavedProfilesYetAskArc")}
            </p>
          )}

          <details className="arcTeammateAdvanced">
            <summary>{tr("arc.teams.arcTeamsPage.advancedProfileSetup")}</summary>
            <p>{tr("arc.teams.arcTeamsPage.youCanAlsoMaintainASaved")}</p>
            <button type="button" className="raSettingsButton" onClick={() => editEmployee(null)}>
              {tr("arc.teams.arcTeamsPage.addSavedAgent")}
            </button>{" "}
            <button
              type="button"
              className="raSettingsButton"
              disabled={!employees.length}
              onClick={() => editTeam(null)}
            >
              {tr("arc.teams.arcTeamsPage.addSavedTeam")}
            </button>
          </details>
          {roomId && <ArcTeamArchive roomId={roomId} tr={tr} />}
          {employee !== undefined && (
            <EmployeeEditor
              key={employee?.id || "new"}
              initial={employee}
              data={data}
              tr={tr}
              onClose={() => editEmployee(undefined)}
              onSaved={() => {
                if (generation.current !== version) return;
                if (editorGeneration.current === editorVersion) editEmployee(undefined);
                setRevision((v) => v + 1);
              }}
            />
          )}
          {team !== undefined && (
            <TeamEditor
              key={team?.id || "new"}
              initial={team}
              employees={data.employees}
              tr={tr}
              onClose={() => editTeam(undefined)}
              onSaved={() => {
                if (generation.current !== version) return;
                if (editorGeneration.current === editorVersion) editTeam(undefined);
                setRevision((v) => v + 1);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
function Modal({
  title,
  tr,
  onClose,
  children,
}: {
  title: string;
  tr: Tr;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog className="arcTeamDialog" ref={dialog} aria-labelledby={titleId} onCancel={onClose}>
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label={tr("arc.teams.arcTeamsPage.close")}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export type EmployeeEditorData = Pick<
  Data,
  "service" | "connections" | "devices" | "skills" | "teams" | "resourceWarning"
>;
export function EmployeeEditor({
  initial,
  data,
  tr,
  onClose,
  onSaved,
  initialProfile,
  onCreate,
}: {
  initial: ArcEmployee | null;
  data: EmployeeEditorData;
  tr: Tr;
  onClose: () => void;
  onSaved: () => void;
  initialProfile?: ArcEmployeeProfile;
  onCreate?: (profile: ArcEmployeeProfile) => Promise<void>;
}) {
  const [value, setValue] = useState<ArcEmployeeProfile>(() =>
      initial
        ? {
            name: initial.name,
            responsibility: initial.responsibility,
            instructions: initial.instructions,
            modelId: initial.modelId,
            avatar: initial.avatar,
            scope: initial.scope,
          }
        : initialProfile || emptyProfile(),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [objectId] = useState(() => initial?.id || crypto.randomUUID());
  const lock = useRef(false);
  const patch = (next: Partial<ArcEmployeeProfile>) =>
    setValue((current) => ({ ...current, ...next }));
  const patchScope = (next: Partial<ArcEmployeeProfile["scope"]>) =>
    patch({ scope: { ...value.scope, ...next } });
  const toggle = (items: string[], id: string) =>
    items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
  async function photo(file: File) {
    if (file.size > 5000000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(tr("arc.teams.arcTeamsPage.chooseAPngJpegOrWebp"));
      return;
    }
    try {
      const bitmap = await createImageBitmap(file),
        canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const edge = Math.min(bitmap.width, bitmap.height);
      canvas
        .getContext("2d")!
        .drawImage(
          bitmap,
          (bitmap.width - edge) / 2,
          (bitmap.height - edge) / 2,
          edge,
          edge,
          0,
          0,
          128,
          128,
        );
      bitmap.close();
      patch({ avatar: { kind: "image", dataUrl: canvas.toDataURL("image/png") } });
    } catch {
      setError(tr("arc.teams.arcTeamsPage.thisImageCouldNotBeOpened"));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (onCreate) await onCreate(value);
      else
        await arcRequest("employees" + (initial ? "/" + initial.id : ""), {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify(
            initial
              ? { expectedVersion: initial.version, profile: value }
              : { id: objectId, profile: value },
          ),
        });
      onSaved();
    } catch (error) {
      setError(fail((error as Error).message, tr));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const selectedDevices = data.devices.filter((device) =>
      value.scope.deviceIds.includes(device.id),
    ),
    commonTools =
      selectedDevices[0]?.tools.filter((tool) =>
        selectedDevices.every((device) => device.tools.includes(tool)),
      ) || [];
  return (
    <Modal
      title={
        initial
          ? tr("arc.teams.arcTeamsPage.editAgent")
          : initialProfile
            ? tr("arc.teams.arcTeamsPage.reviewAgent")
            : tr("arc.teams.arcTeamsPage.addAnAgent")
      }
      tr={tr}
      onClose={onClose}
    >
      <form onSubmit={(event) => void save(event)}>
        {error && (
          <p role="alert" className="arcTeamAlert">
            {error}
          </p>
        )}
        <div className="arcEmployeeIdentity">
          <EmployeeAvatar employee={value} size={56} />
          <label>
            {tr("arc.teams.arcTeamsPage.name")}
            <input
              autoFocus
              required
              maxLength={80}
              value={value.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
        </div>
        <div className="arcTeamTwo">
          <label>
            {tr("arc.teams.arcTeamsPage.avatar")}
            <select
              value={value.avatar.kind}
              onChange={(event) =>
                patch({
                  avatar:
                    event.target.value === "emoji"
                      ? { kind: "emoji", value: "✨", color: "#446655" }
                      : { kind: "initials", color: "#446655" },
                })
              }
            >
              <option value="initials">{tr("arc.teams.arcTeamsPage.initials")}</option>
              <option value="emoji">Emoji</option>
              {value.avatar.kind === "image" && (
                <option value="image">{tr("arc.teams.arcTeamsPage.uploadedImage")}</option>
              )}
            </select>
          </label>
          {value.avatar.kind === "emoji" && (
            <label>
              Emoji
              <input
                maxLength={16}
                value={value.avatar.value}
                onChange={(event) =>
                  patch({
                    avatar: {
                      kind: "emoji",
                      value: event.target.value,
                      color: value.avatar.kind === "emoji" ? value.avatar.color : "#446655",
                    },
                  })
                }
              />
            </label>
          )}
          {value.avatar.kind !== "image" && (
            <label>
              {tr("arc.teams.arcTeamsPage.color")}
              <input
                type="color"
                value={value.avatar.color}
                onChange={(event) =>
                  patch({
                    avatar:
                      value.avatar.kind === "initials"
                        ? { ...value.avatar, color: event.target.value }
                        : value.avatar.kind === "emoji"
                          ? { ...value.avatar, color: event.target.value }
                          : value.avatar,
                  })
                }
              />
            </label>
          )}
        </div>
        <label>
          {tr("arc.teams.arcTeamsPage.uploadAvatar")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void photo(file);
              event.target.value = "";
            }}
          />
        </label>
        <label>
          {tr("arc.teams.arcTeamsPage.responsibility")}
          <input
            required
            maxLength={500}
            value={value.responsibility}
            placeholder={tr("arc.teams.arcTeamsPage.eGProductDesignDevelopmentOr")}
            onChange={(event) => patch({ responsibility: event.target.value })}
          />
        </label>
        <label>
          {tr("arc.teams.arcTeamsPage.model")}
          <select
            aria-label={tr("arc.teams.arcTeamsPage.model")}
            value={value.modelId}
            onChange={(event) => patch({ modelId: event.target.value })}
          >
            {data.service.models.map((model) => (
              <option
                key={model.id}
                value={model.id}
                disabled={
                  !model.configured ||
                  Boolean(model.requiresPaid && data.service.access.status !== "paid")
                }
              >
                {model.label}
                {model.requiresPaid && data.service.access.status !== "paid"
                  ? " · " + tr("arc.teams.arcTeamsPage.paidPlan")
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("arc.teams.arcTeamsPage.workingInstructions")}
          <textarea
            rows={4}
            maxLength={6000}
            value={value.instructions}
            onChange={(event) => patch({ instructions: event.target.value })}
          />
        </label>
        <details className="arcTeamAccess">
          <summary>{tr("arc.teams.arcTeamsPage.appsAndComputerAccess")}</summary>
          <p>{tr("arc.teams.arcTeamsPage.chooseTheConnectedResourcesThisAgent")}</p>
          <label>
            {tr("arc.teams.arcTeamsPage.appActions")}
            <select
              aria-label={tr("arc.teams.arcTeamsPage.appActions")}
              value={value.scope.appMode}
              onChange={(event) =>
                patchScope({
                  appMode: event.target.value as ArcEmployeeProfile["scope"]["appMode"],
                  connectionIds: [],
                })
              }
            >
              <option value="none">{tr("arc.teams.arcTeamsPage.noAppAccess2")}</option>
              <option value="read">{tr("arc.teams.arcTeamsPage.readOnly")}</option>
              <option value="write">{tr("arc.teams.arcTeamsPage.readAndWrite")}</option>
            </select>
          </label>
          {value.scope.appMode !== "none" &&
            data.connections
              .filter((connection) => connection.status === "active")
              .map((connection) => (
                <label className="arcTeamCheck" key={connection.id}>
                  <input
                    type="checkbox"
                    checked={value.scope.connectionIds.includes(connection.id)}
                    disabled={
                      value.scope.appMode === "write" && !connection.permissions?.includes("write")
                    }
                    onChange={() =>
                      patchScope({
                        connectionIds: toggle(value.scope.connectionIds, connection.id),
                      })
                    }
                  />
                  <span>
                    {connection.provider} · {connection.accountLabel}
                  </span>
                </label>
              ))}
          {data.resourceWarning && (
            <p role="status">{tr("arc.teams.arcTeamsPage.someConnectedResourcesCouldNotLoad")}</p>
          )}
          <strong>{tr("arc.teams.arcTeamsPage.skills")}</strong>
          {data.skills.map((skill) => (
            <label className="arcTeamCheck" key={skill.id}>
              <input
                type="checkbox"
                checked={value.scope.skillIds.includes(skill.id)}
                onChange={() => patchScope({ skillIds: toggle(value.scope.skillIds, skill.id) })}
              />
              <span>{skill.name}</span>
            </label>
          ))}
          <strong>{tr("arc.teams.arcTeamsPage.teamHandoffs")}</strong>
          <p>{tr("arc.teams.arcTeamsPage.allowThisAgentToHandWork")}</p>
          {data.teams
            .filter((team) => team.status === "active")
            .map((team) => (
              <label className="arcTeamCheck" key={team.id}>
                <input
                  type="checkbox"
                  checked={value.scope.delegationTeamIds?.includes(team.id) || false}
                  onChange={() =>
                    patchScope({
                      delegationTeamIds: toggle(value.scope.delegationTeamIds || [], team.id),
                    })
                  }
                />
                <span>{team.name}</span>
              </label>
            ))}
          <strong>{tr("arc.teams.arcTeamsPage.computers2")}</strong>
          {data.devices.map((device) => (
            <label className="arcTeamCheck" key={device.id}>
              <input
                type="checkbox"
                checked={value.scope.deviceIds.includes(device.id)}
                onChange={() =>
                  patchScope({
                    deviceIds: toggle(value.scope.deviceIds, device.id),
                    deviceTools: [],
                  })
                }
              />
              <span>
                {device.name} · {device.status}
              </span>
            </label>
          ))}
          {commonTools.length > 0 && (
            <fieldset>
              <legend>{tr("arc.teams.arcTeamsPage.allowedTools")}</legend>
              {commonTools.map((tool) => (
                <label className="arcTeamCheck" key={tool}>
                  <input
                    type="checkbox"
                    checked={value.scope.deviceTools.includes(tool)}
                    onChange={() =>
                      patchScope({ deviceTools: toggle(value.scope.deviceTools, tool) })
                    }
                  />
                  <span>{tool}</span>
                </label>
              ))}
            </fieldset>
          )}
        </details>
        <footer>
          <span>{tr("arc.teams.arcTeamsPage.usesYourAccountSExistingCredits")}</span>
          <button
            type="submit"
            className="addButton arcRadiantCta"
            disabled={
              busy ||
              !data.service.models.some((model) => model.id === value.modelId && model.configured)
            }
          >
            {busy
              ? tr("arc.teams.arcTeamsPage.saving")
              : onCreate
                ? tr("arc.teams.arcTeamsPage.createAgent")
                : tr("arc.teams.arcTeamsPage.saveAgent")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function TeamEditor({
  initial,
  employees,
  tr,
  onClose,
  onSaved,
}: {
  initial: ArcTeam | null;
  employees: ArcEmployee[];
  tr: Tr;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ArcTeamProfile>(() =>
      initial
        ? {
            name: initial.name,
            purpose: initial.purpose,
            employeeIds: initial.employeeIds,
            coordinatorId: initial.coordinatorId,
          }
        : { name: "", purpose: "", employeeIds: [], coordinatorId: null },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [objectId] = useState(() => initial?.id || crypto.randomUUID()),
    lock = useRef(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await arcRequest("teams" + (initial ? "/" + initial.id : ""), {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(
          initial
            ? { expectedVersion: initial.version, profile: value }
            : { id: objectId, profile: value },
        ),
      });
      onSaved();
    } catch (error) {
      setError(fail((error as Error).message, tr));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        initial ? tr("arc.teams.arcTeamsPage.manageTeam") : tr("arc.teams.arcTeamsPage.createATeam")
      }
      tr={tr}
      onClose={onClose}
    >
      <form onSubmit={(event) => void save(event)}>
        {error && (
          <p role="alert" className="arcTeamAlert">
            {error}
          </p>
        )}
        <label>
          {tr("arc.teams.arcTeamsPage.teamName")}
          <input
            autoFocus
            required
            maxLength={80}
            value={value.name}
            onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          {tr("arc.teams.arcTeamsPage.purpose")}
          <textarea
            rows={3}
            maxLength={1000}
            value={value.purpose}
            onChange={(event) =>
              setValue((current) => ({ ...current, purpose: event.target.value }))
            }
          />
        </label>
        <fieldset>
          <legend>{tr("arc.teams.arcTeamsPage.members")}</legend>
          {employees.map((employee) => (
            <label className="arcTeamCheck" key={employee.id}>
              <input
                type="checkbox"
                checked={value.employeeIds.includes(employee.id)}
                disabled={
                  employee.status === "archived" && !value.employeeIds.includes(employee.id)
                }
                onChange={() =>
                  setValue((current) => {
                    const ids = current.employeeIds.includes(employee.id)
                      ? current.employeeIds.filter((id) => id !== employee.id)
                      : [...current.employeeIds, employee.id];
                    return {
                      ...current,
                      employeeIds: ids,
                      coordinatorId:
                        current.coordinatorId && ids.includes(current.coordinatorId)
                          ? current.coordinatorId
                          : null,
                    };
                  })
                }
              />
              <EmployeeAvatar employee={employee} size={26} />
              <span>
                {employee.name} · {employee.responsibility}
                {employee.status === "archived"
                  ? " · " + tr("arc.teams.arcTeamsPage.archived")
                  : ""}
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          {tr("arc.teams.arcTeamsPage.coordinator")}
          <select
            value={value.coordinatorId || ""}
            onChange={(event) =>
              setValue((current) => ({ ...current, coordinatorId: event.target.value || null }))
            }
          >
            <option value="">{tr("arc.teams.arcTeamsPage.choosePerConversation")}</option>
            {employees
              .filter(
                (employee) =>
                  value.employeeIds.includes(employee.id) && employee.status === "active",
              )
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
          </select>
        </label>
        <footer>
          <span>{tr("arc.teams.arcTeamsPage.teamsCanChatAndWorkWithout")}</span>
          <button
            type="submit"
            className="addButton arcRadiantCta"
            disabled={busy || !value.employeeIds.length}
          >
            {busy ? tr("arc.teams.arcTeamsPage.saving") : tr("arc.teams.arcTeamsPage.saveTeam")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
