import { usePermission } from "../../hooks/use-permission.js";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/settings/organization-settings.css";

type Role = "owner" | "admin" | "member";
type Organization = {
  id: string;
  name: string;
  kind: "team" | "personal";
  role: Role;
  members: number;
  pending: number;
};
type Invitation = {
  id: string;
  email?: string;
  role: "admin" | "member";
  organization_id: string;
  organization_name?: string;
  expires_at: string;
};
type Member = { user_id: string; email: string; name: string | null; role: Role };
type Collection = { organizations: Organization[]; invitations: Invitation[] };
type Detail = { organization: Organization; members: Member[]; invitations: Invitation[] };

async function organizationApi<T>(path = "", method = "GET", data?: object): Promise<T> {
  const response = await fetch("/api/organizations" + path, {
    method,
    credentials: "same-origin",
    ...(method !== "GET"
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data ?? {}) }
      : {}),
  });
  const payload = (await response
    .json()
    .then(canonicalErrorEnvelope)
    .catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "HTTP " + response.status);
  return payload;
}

export function OrganizationSettings({ currentEmail }: { currentEmail: string }) {
  const { tr } = useI18n();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [editing, setEditing] = useState<"create" | "rename" | "invite" | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(preferred?: string) {
    const list = await organizationApi<Collection>();
    setCollection(list);
    const candidate = preferred || selected || list.organizations[0]?.id;
    const id = list.organizations.some((item) => item.id === candidate)
      ? candidate!
      : list.organizations[0]?.id || "";
    setSelected(id);
    if (!id) {
      setDetail(null);
      return;
    }
    const item = await organizationApi<Detail>("/" + encodeURIComponent(id));
    setDetail(item);
    setRenameName(item.organization.name);
  }

  useEffect(() => {
    let active = true;
    void organizationApi<Collection>()
      .then(async (list) => {
        if (!active) return;
        setCollection(list);
        const id = list.organizations[0]?.id || "";
        setSelected(id);
        if (id) {
          const item = await organizationApi<Detail>("/" + encodeURIComponent(id));
          if (active) {
            setDetail(item);
            setRenameName(item.organization.name);
          }
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function mutate(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function selectWorkspace(id: string) {
    setSelected(id);
    setDetail(null);
    setEditing(null);
    setError("");
    setNotice("");
    try {
      const data = await organizationApi<Detail>("/" + encodeURIComponent(id));
      setDetail(data);
      setRenameName(data.organization.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const org = detail?.organization;
  const { can } = usePermission({ organizationRole: org?.role });
  const canManage = can("organization:manage");
  const isTeam = org?.kind === "team";

  return (
    <section
      className="orgHub"
      aria-label={tr("settings.organizationSettings.organizationSettings")}
    >
      <header className="orgHubHeader">
        <div className="orgHubHeading">
          <span className="orgHubEyebrow">{tr("settings.organizationSettings.workspaces")}</span>
          <h2>{tr("settings.organizationSettings.organizationsTeammates")}</h2>
          <p>{tr("settings.organizationSettings.workWithYourTeamWhileKeeping")}</p>
        </div>
        <button
          className="orgHubPrimary"
          type="button"
          onClick={() => setEditing(editing === "create" ? null : "create")}
        >
          <span aria-hidden="true">＋</span> {tr("settings.organizationSettings.createTeam")}
        </button>
      </header>

      {editing === "create" && (
        <form
          className="orgHubInlineForm"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(async () => {
              const created = await organizationApi<{ organization: Organization }>("", "POST", {
                name: newName.trim(),
              });
              setNewName("");
              setEditing(null);
              await refresh(created.organization.id);
              setNotice(tr("settings.organizationSettings.teamCreated"));
            });
          }}
        >
          <label htmlFor="org-create-name">{tr("settings.organizationSettings.teamName")}</label>
          <input
            id="org-create-name"
            maxLength={80}
            required
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={tr("settings.organizationSettings.eGProductEngineering")}
          />
          <button className="orgHubPrimary" type="submit" disabled={busy || !newName.trim()}>
            {tr("settings.organizationSettings.create")}
          </button>
          <button type="button" onClick={() => setEditing(null)}>
            {tr("settings.organizationSettings.cancel")}
          </button>
        </form>
      )}

      {error && (
        <div className="orgHubAlert" role="alert">
          <span>
            {tr("settings.organizationSettings.couldNotLoadOrganization")}: {error}
          </span>
          <button
            type="button"
            onClick={() => {
              setError("");
              void refresh().catch((cause) => setError(String(cause)));
            }}
          >
            {tr("settings.organizationSettings.retry")}
          </button>
        </div>
      )}
      {notice && (
        <p className="orgHubSuccess" role="status">
          {notice}
        </p>
      )}

      <div
        className="orgHubSwitcher"
        role="group"
        aria-label={tr("settings.organizationSettings.yourWorkspaces")}
      >
        {(collection?.organizations || []).map((item) => (
          <button
            type="button"
            className={item.id === selected ? "active" : ""}
            aria-pressed={item.id === selected}
            key={item.id}
            onClick={() => void selectWorkspace(item.id)}
          >
            <span className="orgHubSymbol" aria-hidden="true">
              {item.kind === "personal" ? "⌂" : item.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="orgHubTabName">
              {item.kind === "personal" ? tr("settings.organizationSettings.personal") : item.name}
            </span>
            {item.kind === "team" && <small>{item.members}</small>}
          </button>
        ))}
        {loading && (
          <span className="orgHubLoading">{tr("settings.organizationSettings.loading")}</span>
        )}
      </div>

      {org && (
        <div className="orgHubBody">
          <div className="orgHubSummary">
            <div className="orgHubMark" aria-hidden="true">
              {isTeam ? "▦" : "⌂"}
            </div>
            <div className="orgHubSummaryText">
              <h3>
                {isTeam ? org.name : tr("settings.organizationSettings.yourPersonalWorkspace")}
              </h3>
              <p>
                {isTeam
                  ? tr("settings.organizationSettings.aPlaceForYourTeamAnd")
                  : tr("settings.organizationSettings.onlyYouCanAccessYourPersonal")}
              </p>
            </div>
            <span className="orgHubRole">
              {isTeam ? org.role : tr("settings.organizationSettings.private")}
            </span>
            {isTeam && canManage && (
              <button
                className="orgHubSubtle"
                type="button"
                onClick={() => setEditing(editing === "rename" ? null : "rename")}
              >
                {tr("settings.organizationSettings.rename")}
              </button>
            )}
          </div>

          {editing === "rename" && isTeam && canManage && (
            <form
              className="orgHubInlineForm"
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(async () => {
                  await organizationApi("/" + encodeURIComponent(selected), "PATCH", {
                    name: renameName.trim(),
                  });
                  await refresh();
                  setEditing(null);
                  setNotice(tr("settings.organizationSettings.nameUpdated"));
                });
              }}
            >
              <label htmlFor="org-rename-name">
                {tr("settings.organizationSettings.organizationName")}
              </label>
              <input
                id="org-rename-name"
                maxLength={80}
                required
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
              />
              <button
                className="orgHubPrimary"
                type="submit"
                disabled={busy || renameName.trim() === org.name}
              >
                {tr("settings.organizationSettings.save")}
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                {tr("settings.organizationSettings.cancel")}
              </button>
            </form>
          )}

          {isTeam && (
            <div className="orgHubPeople">
              <header className="orgHubPeopleHeader">
                <div>
                  <h4>
                    {tr("settings.organizationSettings.members")}{" "}
                    <span>{detail.members.length}</span>
                  </h4>
                  <p>{tr("settings.organizationSettings.manageWhoCanAccessThisOrganization")}</p>
                </div>
                {canManage && (
                  <button
                    className="orgHubPrimary orgHubInviteButton"
                    type="button"
                    onClick={() => setEditing(editing === "invite" ? null : "invite")}
                  >
                    <span aria-hidden="true">＋</span>{" "}
                    {tr("settings.organizationSettings.inviteMember")}
                  </button>
                )}
              </header>
              {editing === "invite" && canManage && (
                <form
                  className="orgHubInlineForm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate(async () => {
                      await organizationApi(
                        "/" + encodeURIComponent(selected) + "/invitations",
                        "POST",
                        { email: email.trim(), role },
                      );
                      setEmail("");
                      setEditing(null);
                      await refresh();
                      setNotice(
                        tr("settings.organizationSettings.inviteCreatedYourTeammateCanAccept"),
                      );
                    });
                  }}
                >
                  <label htmlFor="org-invite-email">
                    {tr("settings.organizationSettings.email")}
                  </label>
                  <input
                    id="org-invite-email"
                    type="email"
                    maxLength={254}
                    required
                    placeholder="teammate@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <select
                    value={role}
                    aria-label={tr("settings.organizationSettings.role")}
                    onChange={(event) => setRole(event.target.value as "member" | "admin")}
                  >
                    <option value="member">{tr("settings.organizationSettings.member")}</option>
                    {can("organization:assignRole") && (
                      <option value="admin">{tr("settings.organizationSettings.admin")}</option>
                    )}
                  </select>
                  <button className="orgHubPrimary" type="submit" disabled={busy || !email.trim()}>
                    {tr("settings.organizationSettings.invite")}
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    {tr("settings.organizationSettings.cancel")}
                  </button>
                </form>
              )}

              <div className="orgHubMemberList">
                {detail.members.map((member) => (
                  <div className="orgHubMember" key={member.user_id}>
                    <div className="orgHubMemberAvatar" aria-hidden="true">
                      {(member.name || member.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="orgHubMemberName">
                      <strong>{member.name || member.email}</strong>
                      <small>{member.email}</small>
                    </div>
                    {can("organization:assignRole", { role: member.role, self: false }) ? (
                      <select
                        aria-label={tr("settings.organizationSettings.memberRole")}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void mutate(async () => {
                            await organizationApi(
                              "/" +
                                encodeURIComponent(selected) +
                                "/members/" +
                                encodeURIComponent(member.user_id),
                              "PATCH",
                              { role: event.target.value },
                            );
                            await refresh();
                          })
                        }
                      >
                        <option value="member">{tr("settings.organizationSettings.member")}</option>
                        <option value="admin">{tr("settings.organizationSettings.admin")}</option>
                      </select>
                    ) : (
                      <span className="orgHubMemberRole">{member.role}</span>
                    )}
                    {can("organization:removeMember", {
                      role: member.role,
                      self: member.email.toLowerCase() === currentEmail.toLowerCase(),
                    }) && (
                      <button
                        type="button"
                        className="orgHubRemove"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              tr("settings.organizationSettings.removeThisMemberFromTheTeam"),
                            )
                          )
                            return;
                          void mutate(async () => {
                            await organizationApi(
                              "/" +
                                encodeURIComponent(selected) +
                                "/members/" +
                                encodeURIComponent(member.user_id),
                              "DELETE",
                            );
                            await refresh();
                            setNotice(tr("settings.organizationSettings.memberRemoved"));
                          });
                        }}
                      >
                        {member.email.toLowerCase() === currentEmail.toLowerCase()
                          ? tr("settings.organizationSettings.leave")
                          : tr("settings.organizationSettings.remove")}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {canManage && !!detail.invitations.length && (
                <div className="orgHubPending">
                  <h4>{tr("settings.organizationSettings.pendingInvitations")}</h4>
                  {detail.invitations.map((invite) => (
                    <div className="orgHubMember" key={invite.id}>
                      <div className="orgHubMemberAvatar orgHubPendingIcon" aria-hidden="true">
                        ✉
                      </div>
                      <div className="orgHubMemberName">
                        <strong>{invite.email}</strong>
                        <small>
                          {invite.role} · {tr("settings.organizationSettings.expires")}{" "}
                          {new Date(invite.expires_at).toLocaleDateString()}
                        </small>
                      </div>
                      <button
                        className="orgHubRemove"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(async () => {
                            await organizationApi(
                              "/" +
                                encodeURIComponent(selected) +
                                "/invitations/" +
                                encodeURIComponent(invite.id),
                              "DELETE",
                            );
                            await refresh();
                          })
                        }
                      >
                        {tr("settings.organizationSettings.revoke")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!!collection?.invitations.length && (
        <div className="orgHubInbox">
          <h3>{tr("settings.organizationSettings.teamInvitations")}</h3>
          {collection.invitations.map((invite) => (
            <div className="orgHubMember" key={invite.id}>
              <div className="orgHubMemberAvatar" aria-hidden="true">
                ✉
              </div>
              <div className="orgHubMemberName">
                <strong>{invite.organization_name}</strong>
                <small>
                  {invite.role} · {new Date(invite.expires_at).toLocaleDateString()}
                </small>
              </div>
              <button
                type="button"
                className="orgHubPrimary"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await organizationApi(
                      "/invitations/" + encodeURIComponent(invite.id) + "/accept",
                      "POST",
                    );
                    await refresh(invite.organization_id);
                    setNotice(tr("settings.organizationSettings.joinedTeam"));
                  })
                }
              >
                {tr("settings.organizationSettings.accept")}
              </button>
              <button
                type="button"
                className="orgHubSubtle"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await organizationApi(
                      "/invitations/" + encodeURIComponent(invite.id) + "/reject",
                      "POST",
                    );
                    await refresh();
                  })
                }
              >
                {tr("settings.organizationSettings.decline")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
