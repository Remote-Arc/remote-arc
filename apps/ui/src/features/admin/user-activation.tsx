import React from 'react';
import { ACTIVATION_STAGES, type ActivationEvidence } from '../../../../../packages/protocol/src/admin-activation.js';
import { useI18n } from '../../app/i18n.js';

export function UserActivationBadge({ evidence }: { evidence: ActivationEvidence }) {
  const { tr } = useI18n();
  const stage = ACTIVATION_STAGES.find(stage => stage.id === evidence.activation_stage);
  return <span className={'opsActivationBadge stage-' + (stage?.id || 'history_unknown')}>
    {stage ? tr(stage.en, stage.zh) : tr('History incomplete', '历史记录不完整')}
  </span>;
}

export function UserActivationEvidence({ evidence }: { evidence: ActivationEvidence }) {
  const { tr, locale } = useI18n();
  const when = (at: string | null) => at ? new Date(at).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-NZ') : tr('Not recorded', '无记录');
  return <div className="opsActivationEvidence">
    <h4>{tr('Activation evidence', '激活依据')}</h4><UserActivationBadge evidence={evidence} />
    <dl>
      <div><dt>{tr('MCP OAuth', 'MCP OAuth')}</dt><dd>{when(evidence.first_mcp_connected_at)} · {tr('Active clients', '当前有效客户端')} {evidence.active_mcp_connections}</dd></div>
      <div><dt>{tr('Connection source', '连接来源')}</dt><dd>{evidence.plugin_connections > 0
        ? tr('Issued OAuth token matched an operator-verified plugin client ID.', '已签发 OAuth 记录匹配管理员核实的插件客户端 ID。')
        : evidence.mcp_connections > 0 ? tr('MCP OAuth confirmed; plugin source unverified.', '已确认 MCP OAuth；插件来源未核实。')
        : tr('No issued MCP OAuth token recorded.', '尚无 MCP OAuth 签发记录。')}</dd></div>
      <div><dt>{tr('First computer pairing', '首次配对电脑')}</dt><dd>{when(evidence.first_computer_paired_at)}</dd></div>
      <div><dt>{tr('First recorded online', '首次记录上线')}</dt><dd>{when(evidence.first_computer_online_at)}</dd></div>
      <div><dt>{tr('First successful use', '首次成功使用')}</dt><dd>{when(evidence.first_success_at)}</dd></div>
      <div><dt>{tr('Last successful use', '最近成功使用')}</dt><dd>{when(evidence.last_success_at)}</dd></div>
      <div><dt>{tr('Successful days (UTC)', '成功使用天数（UTC）')}</dt><dd>{evidence.successful_days}</dd></div>
    </dl>
    <p>{tr('Successful use means a completed device operation, App operation or Arc run. Discovery calls, logins and charged-call totals do not qualify; an operation is not proof that an entire user goal was completed.', '成功使用指设备操作、App 操作或 Arc 运行成功。发现工具、登录和扣费调用数不算成功；单次操作成功不代表整个用户目标已完成。')}</p>
    <p>{tr('Returning active: successful use on at least two UTC dates, with the latest in the past 7 days. Stages describe recorded progress; live connection status is shown separately. Missing or expired historical records cannot prove that someone never used the product.', '回访活跃：至少两个 UTC 日期成功使用，且最近一次在 7 天内。阶段表示已记录的进展，实时在线状态单独显示；历史缺失或过期不代表用户从未使用过。')}</p>
  </div>;
}
