import { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import "./organization-settings.css";

type Organization = { id: string; name: string; kind: "team"|"personal"; role: "owner"|"admin"|"member"; members: number; pending: number };
type Invite = { id: string; email?: string; role: "admin"|"member"; organization_id: string; organization_name?: string; expires_at: string };
type Member = { user_id: string; email: string; name: string | null; role: "owner"|"admin"|"member"; status: string };
type Detail = { organization: Organization; members: Member[]; invitations: Invite[] };
type Collection = { organizations: Organization[]; invitations: Invite[] };

async function api<T>(path: string, method = "GET", value?: object): Promise<T> {
  const result = await fetch("/api/organizations" + path, {
    credentials: "same-origin",
    method,
    ...(value === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(value) }),
    ...(value === undefined && method !== "GET" ? { headers: { "content-type": "application/json" }, body: "{}" } : {}),
  });
  const payload = await result.json().catch(() => ({})) as T & { error?: string };
  if (!result.ok) throw new Error(payload.error || "HTTP " + result.status);
  return payload;
}

export function OrganizationSettings({ currentEmail }: { currentEmail: string }) {
  const { tr } = useI18n();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member"|"admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh(prefer?: string) {
    const next = await api<Collection>("");
    setCollection(next);
    const preferred = prefer || selected || next.organizations[0]?.id || "";
    const id = next.organizations.some(org => org.id === preferred) ? preferred : (next.organizations[0]?.id || "");
    setSelected(id);
    if (id) {
      const item = await api<Detail>("/" + encodeURIComponent(id));
      setDetail(item);
      setRenameValue(item.organization.name);
    } else setDetail(null);
  }

  useEffect(() => { void refresh().catch(() => setError(tr("Organizations are unavailable.", "暂时无法加载组织信息。"))); }, []);

  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function openOrganization(id: string) {
    setSelected(id);
    setError(""); setNotice(""); setDetail(null);
    void api<Detail>("/" + encodeURIComponent(id)).then(value => {
      setDetail(value);
      setRenameValue(value.organization.name);
    }).catch(err => setError(String(err)));
  }

  const org = detail?.organization;
  const manager = org?.role === "owner" || org?.role === "admin";

  return <section className="organizationSettings" aria-label={tr("Organizations and teammates", "组织与队友")}>
    <header className="organizationSettingsIntro">
      <div><span className="eyebrow">WORKSPACES & PEOPLE</span>
        <h2>{tr("Organizations & teammates", "组织与队友")}</h2>
        <p>{tr("Manage your personal workspace and collaborate in teams. Membership does not automatically expose anyone's computers, credentials or private tasks.", "管理个人空间与团队成员。加入团队不会自动共享任何人的设备、凭证或私人任务。")}</p>
      </div>
      <span className="organizationCount">{collection?.organizations.filter(o => o.kind === "team").length ?? "—"} {tr("teams", "个团队")}</span>
    </header>
    {error && <p className="organizationError" role="alert">{error}</p>}
    {notice && <p className="organizationNotice" role="status">{notice}</p>}

    <div className="organizationLayout">
      <aside className="organizationSidebar">
        <span className="organizationOverline">{tr("YOUR WORKSPACES", "你的工作空间")}</span>
        <div className="organizationChoices">
          {collection?.organizations.map(item => <button key={item.id} type="button"
            className={item.id === selected ? "selected" : ""}
            aria-pressed={item.id === selected}
            onClick={() => openOrganization(item.id)}>
            <span className="organizationAvatar">{item.kind === "personal" ? "◉" : item.name.slice(0,1).toUpperCase()}</span>
            <span><strong>{item.name}</strong><small>{item.kind === "personal" ? tr("Personal · private", "个人 · 私有") : item.members + " " + tr("members", "位成员")}</small></span>
          </button>)}
          {!collection && <p>{tr("Loading workspaces…", "正在加载工作空间…")}</p>}
        </div>
        <form className="organizationCreateForm" onSubmit={event => { event.preventDefault(); void action(async () => {
          const data = await api<{ organization: Organization }>("", "POST", { name: newName });
          setNewName(""); await refresh(data.organization.id); setNotice(tr("Team created.", "团队已创建。"));
        }); }}>
          <label htmlFor="org-new-name">{tr("New team", "新建团队")}</label>
          <div><input id="org-new-name" maxLength={80} value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={tr("Team name", "团队名称")} required />
          <button type="submit" disabled={busy || !newName.trim()}>+</button></div>
        </form>
      </aside>
      <div className="organizationMain">
        {detail && <div className="organizationCurrent">
          <div className="organizationCurrentTop"><div><span className="organizationOverline">{org?.kind === "team" ? tr("TEAM WORKSPACE", "团队空间") : tr("PRIVATE WORKSPACE", "私人空间")}</span><h3>{org?.name}</h3><p>{tr("Your role", "你的角色")} · {org?.role}</p></div>
          <span className="organizationRole">{org?.role}</span></div>
          {manager && <form className="organizationRename" onSubmit={event => { event.preventDefault(); void action(async () => {
            await api("/" + encodeURIComponent(selected), "PATCH", { name: renameValue });
            await refresh(); setNotice(tr("Organization renamed.", "组织名称已更新。"));
          }); }}>
            <label htmlFor="org-rename">{tr("Organization name", "组织名称")}</label>
            <div><input id="org-rename" maxLength={80} value={renameValue} onChange={e => setRenameValue(e.target.value)} required />
              <button disabled={busy || renameValue.trim() === org?.name} type="submit">{tr("Save", "保存")}</button></div>
          </form>}
          <div className="organizationSectionHeader"><div><h4>{tr("Teammates", "团队成员")}</h4><p>{detail.members.length} {tr("active members", "位活跃成员")}</p></div></div>
          <div className="organizationMemberList">
            {detail.members.map(member => <div className="organizationMember" key={member.user_id}>
              <span className="organizationMemberAvatar">{(member.name || member.email).slice(0,1).toUpperCase()}</span>
              <div><strong>{member.name || member.email}{member.email.toLowerCase() === currentEmail.toLowerCase() ? tr(" (you)", "（你）") : ""}</strong>
                <small>{member.email}</small></div>
              <span className="organizationRole">{member.role}</span>
              {org?.kind === "team" && org.role === "owner" && member.role !== "owner" &&
                <select aria-label={tr("Change role", "修改角色")} disabled={busy} value={member.role}
                  onChange={e => void action(async () => {
                    await api("/" + encodeURIComponent(selected) + "/members/" + encodeURIComponent(member.user_id), "PATCH", { role: e.target.value });
                    await refresh();
                  })}><option value="member">{tr("Member", "成员")}</option><option value="admin">{tr("Admin", "管理员")}</option></select>}
              {org?.kind === "team" && member.role !== "owner" && (member.email.toLowerCase() === currentEmail.toLowerCase() || org.role === "owner" || (org.role === "admin" && member.role === "member")) &&
                <button type="button" className="organizationTextButton" disabled={busy} onClick={() => {
                  if (!window.confirm(tr("Remove this member from the organization?", "确认将该成员移出组织？"))) return;
                  void action(async () => {
                    await api("/" + encodeURIComponent(selected) + "/members/" + encodeURIComponent(member.user_id), "DELETE");
                    await refresh(); setNotice(tr("Member removed.", "成员已移除。"));
                  });
                }}>{member.email.toLowerCase() === currentEmail.toLowerCase() ? tr("Leave", "退出") : tr("Remove", "移除")}</button>}
            </div>)}
          </div>
          {org?.kind === "team" && manager && <>
            <div className="organizationSectionHeader"><div><h4>{tr("Invite teammates", "邀请队友")}</h4><p>{tr("Invite by email. Teammates see the invitation in Settings after signing in.", "通过邮箱邀请。队友登录后可在设置页接受邀请。")}</p></div></div>
            <form className="organizationInviteForm" onSubmit={event => { event.preventDefault(); void action(async () => {
              await api("/" + encodeURIComponent(selected) + "/invitations", "POST", { email, role: inviteRole });
              setEmail(""); await refresh(); setNotice(tr("Invitation created. Ask your teammate to sign in and accept it in Settings.", "邀请已创建，请让队友登录后在设置页接受。"));
            }); }}>
              <label htmlFor="org-invite-email">{tr("Email address", "邮箱地址")}</label>
              <div><input id="org-invite-email" type="email" maxLength={254} required placeholder="teammate@example.com"
                value={email} onChange={e => setEmail(e.target.value)} />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "member"|"admin")} aria-label={tr("Invitation role", "邀请角色")}>
                  <option value="member">{tr("Member", "成员")}</option>
                  {org.role === "owner" && <option value="admin">{tr("Admin", "管理员")}</option>}
                </select><button type="submit" disabled={busy || !email.trim()}>{tr("Invite", "邀请")}</button></div>
            </form>
            {!!detail.invitations.length && <div className="organizationPending"><h4>{tr("Pending invitations", "待接受的邀请")}</h4>
              {detail.invitations.map(invite => <div className="organizationPendingRow" key={invite.id}>
                <span><strong>{invite.email}</strong><small>{invite.role} · {tr("expires", "有效期至")} {new Date(invite.expires_at).toLocaleDateString()}</small></span>
                <button disabled={busy} onClick={() => void action(async () => {
                  await api("/" + encodeURIComponent(selected) + "/invitations/" + encodeURIComponent(invite.id), "DELETE");
                  await refresh();
                })}>{tr("Revoke", "撤销")}</button>
              </div>)}</div>}
          </>}
          {org?.kind === "personal" && <p className="organizationPrivacy">{tr("Your personal workspace is private. Create a team to invite collaborators; existing device permissions stay yours.", "个人空间只属于你。创建团队后即可邀请队友，现有设备权限仍归你个人所有。")}</p>}
        </div>}
        {!detail && <div className="organizationEmpty">{tr("Select an organization to view teammates.", "选择工作空间以查看成员。")}</div>}
      </div>
    </div>
    {!!collection?.invitations.length && <div className="organizationInbox">
      <h3>{tr("Invitations to you", "邀请你加入的团队")}</h3>
      {collection.invitations.map(item => <div key={item.id} className="organizationInboxRow">
        <div><strong>{item.organization_name}</strong><small>{tr("Invited as", "邀请角色")} {item.role} · {tr("expires", "有效期至")} {new Date(item.expires_at).toLocaleDateString()}</small></div>
        <div><button disabled={busy} onClick={() => void action(async () => {
          await api("/invitations/" + encodeURIComponent(item.id) + "/accept", "POST");
          await refresh(item.organization_id); setNotice(tr("You joined the team.", "你已加入团队。"));
        })}>{tr("Accept", "接受")}</button><button className="organizationSecondary" disabled={busy} onClick={() => void action(async () => {
          await api("/invitations/" + encodeURIComponent(item.id) + "/reject", "POST");
          await refresh();
        })}>{tr("Decline", "拒绝")}</button></div>
      </div>)}
    </div>}
  </section>;
}
