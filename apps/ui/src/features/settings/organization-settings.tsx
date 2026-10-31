import { useEffect, useState } from "react";
import { useI18n } from "../../app/i18n.js";
import "./organization-settings.css";

type Role = "owner" | "admin" | "member";
type Organization = { id: string; name: string; kind: "team" | "personal"; role: Role; members: number; pending: number };
type Invitation = { id: string; email?: string; role: "admin" | "member"; organization_id: string; organization_name?: string; expires_at: string };
type Member = { user_id: string; email: string; name: string | null; role: Role };
type Collection = { organizations: Organization[]; invitations: Invitation[] };
type Detail = { organization: Organization; members: Member[]; invitations: Invitation[] };

async function organizationApi<T>(path = "", method = "GET", data?: object): Promise<T> {
  const response = await fetch("/api/organizations" + path, {
    method, credentials: "same-origin",
    ...(method !== "GET" ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data ?? {}) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
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
    const id = list.organizations.some(item => item.id === candidate) ? candidate! : list.organizations[0]?.id || "";
    setSelected(id);
    if (!id) { setDetail(null); return; }
    const item = await organizationApi<Detail>("/" + encodeURIComponent(id));
    setDetail(item);
    setRenameName(item.organization.name);
  }

  useEffect(() => {
    let active = true;
    void organizationApi<Collection>().then(async list => {
      if (!active) return;
      setCollection(list);
      const id = list.organizations[0]?.id || "";
      setSelected(id);
      if (id) {
        const item = await organizationApi<Detail>("/" + encodeURIComponent(id));
        if (active) { setDetail(item); setRenameName(item.organization.name); }
      }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function mutate(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function selectWorkspace(id: string) {
    setSelected(id); setDetail(null); setEditing(null); setError(""); setNotice("");
    try {
      const data = await organizationApi<Detail>("/" + encodeURIComponent(id));
      setDetail(data); setRenameName(data.organization.name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  const org = detail?.organization;
  const canManage = org?.role === "owner" || org?.role === "admin";
  const isTeam = org?.kind === "team";

  return <section className="orgHub" aria-label={tr("Organization settings", "组织管理")}>
    <header className="orgHubHeader">
      <div className="orgHubHeading">
        <span className="orgHubEyebrow">{tr("WORKSPACES", "工作空间")}</span>
        <h2>{tr("Organizations & teammates", "组织与队友")}</h2>
        <p>{tr("Work with your team while keeping your personal devices private.", "协同管理团队，同时保持个人设备与凭证私有。")}</p>
      </div>
      <button className="orgHubPrimary" type="button" onClick={() => setEditing(editing === "create" ? null : "create")}>
        <span aria-hidden="true">＋</span> {tr("Create team", "创建团队")}
      </button>
    </header>

    {editing === "create" && <form className="orgHubInlineForm" onSubmit={event => {
      event.preventDefault(); void mutate(async () => {
        const created = await organizationApi<{ organization: Organization }>("", "POST", { name: newName.trim() });
        setNewName(""); setEditing(null); await refresh(created.organization.id);
        setNotice(tr("Team created.", "团队创建成功。"));
      });
    }}>
      <label htmlFor="org-create-name">{tr("Team name", "团队名称")}</label>
      <input id="org-create-name" maxLength={80} required autoFocus value={newName} onChange={event => setNewName(event.target.value)}
        placeholder={tr("e.g. Product engineering", "例如：产品研发团队")} />
      <button className="orgHubPrimary" type="submit" disabled={busy || !newName.trim()}>{tr("Create", "创建")}</button>
      <button type="button" onClick={() => setEditing(null)}>{tr("Cancel", "取消")}</button>
    </form>}

    {error && <div className="orgHubAlert" role="alert">
      <span>{tr("Could not load organization", "组织操作失败")}: {error}</span>
      <button type="button" onClick={() => { setError(""); void refresh().catch(cause => setError(String(cause))); }}>{tr("Retry", "重试")}</button>
    </div>}
    {notice && <p className="orgHubSuccess" role="status">{notice}</p>}

    <div className="orgHubSwitcher" role="group" aria-label={tr("Your workspaces", "你的工作空间")}>
      {(collection?.organizations || []).map(item =>
        <button type="button" className={item.id === selected ? "active" : ""} aria-pressed={item.id === selected}
          key={item.id} onClick={() => void selectWorkspace(item.id)}>
          <span className="orgHubSymbol" aria-hidden="true">{item.kind === "personal" ? "⌂" : item.name.slice(0, 1).toUpperCase()}</span>
          <span className="orgHubTabName">{item.kind === "personal" ? tr("Personal", "个人空间") : item.name}</span>
          {item.kind === "team" && <small>{item.members}</small>}
        </button>)}
      {loading && <span className="orgHubLoading">{tr("Loading…", "正在加载…")}</span>}
    </div>

    {org && <div className="orgHubBody">
      <div className="orgHubSummary">
        <div className="orgHubMark" aria-hidden="true">{isTeam ? "▦" : "⌂"}</div>
        <div className="orgHubSummaryText">
          <h3>{isTeam ? org.name : tr("Your personal workspace", "你的个人空间")}</h3>
          <p>{isTeam
            ? tr("A place for your team and its members. Your personal devices stay separate.", "与队友一起协作，个人设备仍保持独立。")
            : tr("Only you can access your personal devices, credentials and tasks.", "你的设备、凭证和私人任务只有你自己可以访问。")}</p>
        </div>
        <span className="orgHubRole">{isTeam ? org.role : tr("Private", "私有")}</span>
        {isTeam && canManage && <button className="orgHubSubtle" type="button"
          onClick={() => setEditing(editing === "rename" ? null : "rename")}>{tr("Rename", "重命名")}</button>}
      </div>

      {editing === "rename" && isTeam && canManage && <form className="orgHubInlineForm" onSubmit={event => {
        event.preventDefault(); void mutate(async () => {
          await organizationApi("/" + encodeURIComponent(selected), "PATCH", { name: renameName.trim() });
          await refresh(); setEditing(null); setNotice(tr("Name updated.", "团队名称已更新。"));
        });
      }}>
        <label htmlFor="org-rename-name">{tr("Organization name", "组织名称")}</label>
        <input id="org-rename-name" maxLength={80} required value={renameName} onChange={event => setRenameName(event.target.value)} />
        <button className="orgHubPrimary" type="submit" disabled={busy || renameName.trim() === org.name}>{tr("Save", "保存")}</button>
        <button type="button" onClick={() => setEditing(null)}>{tr("Cancel", "取消")}</button>
      </form>}

      {isTeam && <div className="orgHubPeople">
        <header className="orgHubPeopleHeader">
          <div><h4>{tr("Members", "团队成员")} <span>{detail.members.length}</span></h4>
            <p>{tr("Manage who can access this organization.", "管理组织成员及其角色。")}</p></div>
          {canManage && <button className="orgHubPrimary orgHubInviteButton" type="button"
            onClick={() => setEditing(editing === "invite" ? null : "invite")}>
            <span aria-hidden="true">＋</span> {tr("Invite member", "邀请成员")}
          </button>}
        </header>
        {editing === "invite" && canManage && <form className="orgHubInlineForm" onSubmit={event => {
          event.preventDefault(); void mutate(async () => {
            await organizationApi("/" + encodeURIComponent(selected) + "/invitations", "POST", { email: email.trim(), role });
            setEmail(""); setEditing(null); await refresh();
            setNotice(tr("Invite created. Your teammate can accept it in Settings after signing in.", "邀请已创建。队友使用对应邮箱登录后可在设置中接受。"));
          });
        }}>
          <label htmlFor="org-invite-email">{tr("Email", "邮箱")}</label>
          <input id="org-invite-email" type="email" maxLength={254} required placeholder="teammate@example.com"
            value={email} onChange={event => setEmail(event.target.value)} />
          <select value={role} aria-label={tr("Role", "角色")} onChange={event => setRole(event.target.value as "member" | "admin")}>
            <option value="member">{tr("Member", "成员")}</option>
            {org.role === "owner" && <option value="admin">{tr("Admin", "管理员")}</option>}
          </select>
          <button className="orgHubPrimary" type="submit" disabled={busy || !email.trim()}>{tr("Invite", "邀请")}</button>
          <button type="button" onClick={() => setEditing(null)}>{tr("Cancel", "取消")}</button>
        </form>}

        <div className="orgHubMemberList">
          {detail.members.map(member => <div className="orgHubMember" key={member.user_id}>
            <div className="orgHubMemberAvatar" aria-hidden="true">{(member.name || member.email).slice(0,1).toUpperCase()}</div>
            <div className="orgHubMemberName"><strong>{member.name || member.email}</strong><small>{member.email}</small></div>
            {org.role === "owner" && member.role !== "owner" ? <select aria-label={tr("Member role", "成员角色")}
              value={member.role} disabled={busy} onChange={event => void mutate(async () => {
                await organizationApi("/" + encodeURIComponent(selected) + "/members/" + encodeURIComponent(member.user_id), "PATCH", { role: event.target.value });
                await refresh();
              })}>
              <option value="member">{tr("Member", "成员")}</option><option value="admin">{tr("Admin", "管理员")}</option>
            </select> : <span className="orgHubMemberRole">{member.role}</span>}
            {member.role !== "owner" && (member.email.toLowerCase() === currentEmail.toLowerCase() ||
              org.role === "owner" || (org.role === "admin" && member.role === "member")) &&
              <button type="button" className="orgHubRemove" disabled={busy} onClick={() => {
                if (!window.confirm(tr("Remove this member from the team?", "确定移除这位队友吗？"))) return;
                void mutate(async () => {
                  await organizationApi("/" + encodeURIComponent(selected) + "/members/" + encodeURIComponent(member.user_id), "DELETE");
                  await refresh(); setNotice(tr("Member removed.", "成员已移除。"));
                });
              }}>{member.email.toLowerCase() === currentEmail.toLowerCase() ? tr("Leave", "退出") : tr("Remove", "移除")}</button>}
          </div>)}
        </div>

        {canManage && !!detail.invitations.length && <div className="orgHubPending">
          <h4>{tr("Pending invitations", "待接受邀请")}</h4>
          {detail.invitations.map(invite => <div className="orgHubMember" key={invite.id}>
            <div className="orgHubMemberAvatar orgHubPendingIcon" aria-hidden="true">✉</div>
            <div className="orgHubMemberName"><strong>{invite.email}</strong>
              <small>{invite.role} · {tr("Expires", "有效期至")} {new Date(invite.expires_at).toLocaleDateString()}</small></div>
            <button className="orgHubRemove" type="button" disabled={busy} onClick={() => void mutate(async () => {
              await organizationApi("/" + encodeURIComponent(selected) + "/invitations/" + encodeURIComponent(invite.id), "DELETE");
              await refresh();
            })}>{tr("Revoke", "撤销")}</button>
          </div>)}
        </div>}
      </div>}
    </div>}

    {!!collection?.invitations.length && <div className="orgHubInbox">
      <h3>{tr("Team invitations", "收到的团队邀请")}</h3>
      {collection.invitations.map(invite => <div className="orgHubMember" key={invite.id}>
        <div className="orgHubMemberAvatar" aria-hidden="true">✉</div>
        <div className="orgHubMemberName"><strong>{invite.organization_name}</strong><small>{invite.role} · {new Date(invite.expires_at).toLocaleDateString()}</small></div>
        <button type="button" className="orgHubPrimary" disabled={busy} onClick={() => void mutate(async () => {
          await organizationApi("/invitations/" + encodeURIComponent(invite.id) + "/accept", "POST");
          await refresh(invite.organization_id); setNotice(tr("Joined team.", "已加入团队。"));
        })}>{tr("Accept", "接受")}</button>
        <button type="button" className="orgHubSubtle" disabled={busy} onClick={() => void mutate(async () => {
          await organizationApi("/invitations/" + encodeURIComponent(invite.id) + "/reject", "POST"); await refresh();
        })}>{tr("Decline", "拒绝")}</button>
      </div>)}
    </div>}
  </section>;
}
