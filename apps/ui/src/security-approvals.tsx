import React, { useState } from "react";
import { useI18n } from "./i18n.js";
import { ProductIcon } from "./product-icon.js";
import type { PendingApproval, PersistentApproval } from "./security-state.js";

export type ApprovalChoice = "allow_once" | "allow_10m" | "allow_always" | "deny";
type SharedProps = { disabled: boolean; deviceNames: Map<string, string> };

export function ApprovalRequest({ approval, disabled, deviceNames, decide }: SharedProps & {
  approval: PendingApproval;
  decide: (approval: PendingApproval, decision: ApprovalChoice) => Promise<void>;
}) {
  const { tr, locale } = useI18n();
  const [choice, setChoice] = useState<Exclude<ApprovalChoice, "deny">>("allow_once");
  const browser = approval.tool_name === "browser_runner_start";
  const scope = choice === "allow_always"
    ? browser ? tr("Until revoked, for this exact browser request, task and sites. Other requests still need approval.", "持续有效直到撤销，仅限这次浏览器请求、任务和网站。其他请求仍需审批。")
      : tr("Until revoked, for this tool and file only. Other files still need approval.", "持续有效直到撤销，仅限此工具和文件。其他文件仍需审批。")
    : choice === "allow_10m" ? tr("This tool may change this file for 10 minutes after approval.", "批准后的 10 分钟内，此工具可以修改该文件。")
      : tr("Applies to this exact request once. A later request will ask again.", "仅批准当前请求一次，后续请求仍需审批。");
  return <article className="approvalRequest" aria-label={approval.tool_name}>
    <header className="approvalRequestHeader">
      <span className="approvalRequestIcon"><ProductIcon name={browser ? "link" : "book"} size={20}/></span>
      <div><h3>{browser ? tr("Allow access to these sites?", "允许访问这些网站？") : tr("Allow this file change?", "允许修改此文件？")}</h3>
        <p>{approval.client_name || approval.client_id || tr("AI client", "AI 客户端")} · {deviceNames.get(approval.device_id) || approval.device_id}</p></div>
      <span className="approvalWaiting">{tr("Needs approval", "待审批")}</span>
    </header>
    <div className="approvalTarget"><span>{browser ? tr("Task & sites", "任务与网站") : tr("File", "文件")}</span><code>{approval.target_path}</code></div>
    <div className="approvalRequestMeta"><code>{approval.tool_name}</code><span>{tr("Expires", "请求到期")} {new Date(approval.expires_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</span></div>
    <div className="approvalDecision">
      <label><span>{tr("Permission duration", "授权时长")}</span><select aria-label={tr("Permission duration", "授权时长")} value={choice} onChange={event => setChoice(event.target.value as typeof choice)}>
        <option value="allow_once">{tr("Allow once", "仅允许一次")}</option>
        {!browser && <option value="allow_10m">{tr("Allow for 10 minutes", "允许 10 分钟")}</option>}
        <option value="allow_always">{browser ? tr("Always allow this request", "始终允许此请求") : tr("Always allow this file", "始终允许此文件")}</option>
      </select></label>
      <div className="approvalDecisionActions"><button className="ghostButton" disabled={disabled} onClick={() => void decide(approval, "deny")}>{tr("Deny", "拒绝")}</button>
        <button className="primaryButton" disabled={disabled} onClick={() => void decide(approval, choice)}>{choice === "allow_always" ? tr("Always allow", "始终允许") : choice === "allow_10m" ? tr("Allow 10 min", "允许 10 分钟") : tr("Allow once", "仅允许一次")}</button></div>
      <p className="approvalScopeNote" aria-live="polite">{scope} {tr("Limited to this AI authorization and computer; device protections still apply.", "仅对当前 AI 授权和电脑有效，设备保护仍然生效。")}</p>
    </div>
  </article>;
}

export function PersistentPermissions({ permissions, disabled, deviceNames, revoke }: SharedProps & {
  permissions: PersistentApproval[];
  revoke: (permission: PersistentApproval) => Promise<void>;
}) {
  const { tr } = useI18n();
  return <section className="securityPanel securityGrantsPanel" aria-label={tr("Always allowed", "始终允许")}>
    <div className="securityPanelHeader"><div><span className="eyebrow">{tr("SAVED PERMISSIONS", "已保存的权限")}</span><h2>{tr("Always allowed", "始终允许")} <span className="approvalCount">{permissions.length}</span></h2>
</div></div>
    <div className="persistentPermissionList">{permissions.map(permission => <article className="persistentPermission" key={permission.id}>
      <div><strong>{permission.tool_name}</strong><p>{permission.client_name || permission.client_id || tr("AI client", "AI 客户端")} · {deviceNames.get(permission.device_id) || permission.device_id}</p><code>{permission.target_path}</code>
        <small>{permission.tool_name === "browser_runner_start" ? tr("Exact browser request · until revoked", "精确浏览器请求 · 撤销前持续有效") : tr("This file only · until revoked", "仅此文件 · 撤销前持续有效")}</small></div>
      <button className="ghostButton" disabled={disabled} onClick={() => void revoke(permission)}>{tr("Revoke", "撤销")}</button>
    </article>)}</div>
    {!permissions.length && <div className="securityEmptyState compact"><strong>{tr("No saved permissions", "暂无长期授权")}</strong></div>}
  </section>;
}
