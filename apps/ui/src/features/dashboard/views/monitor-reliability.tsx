import type { MonitorState } from '../../../types/app-types.js';

export function MonitorReliability({ state, tr }: { state: MonitorState['deviceReliability']; tr: (en: string, zh: string) => string }) {
  const phases = {
    healthy: tr('Below threshold', '低于阈值'), pending: tr('Evaluating sustained churn', '正在观察重连异常'),
    firing: tr('Sustained reconnect anomaly', '持续重连异常'), recovering: tr('Confirming recovery', '正在确认恢复'),
  };
  return <article className="monitorPanel monitorReliability">
    <div className="monitorPanelHeader"><div><span className="eyebrow">{tr('CONNECTIONS', '连接')}</span><h2>{tr('Device reliability', '设备连接稳定性')}</h2></div></div>
    {!state || state.coverage === 'unavailable' ? <p>{tr('Connection telemetry is unavailable. This does not establish healthy devices.', '连接指标暂不可用，不能据此判断设备正常。')}</p>
      : state.coverage === 'no_samples' ? <p>{tr('No recent connection observations. Historical activity cannot be reconstructed.', '近期没有连接观测，无法补算历史活动。')}</p>
        : <>
          <p>{state.signal ? phases[state.signal.phase] : tr('Awaiting scheduled evaluation', '等待定时评估')}
            {' · '}{state.scope === 'single_device' ? tr('Repeated churn is isolated to one device.', '重复重连集中在单台设备。') : state.scope === 'multiple_devices' ? tr('Repeated churn affects multiple devices; this alone does not prove a platform outage.', '多台设备出现重复重连；仅凭该指标不能确认平台故障。') : tr('No device has three connection opens in the recent window.', '近期没有设备建立三次或更多连接。')}</p>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr>
            <th>{tr('Window', '时段')}</th><th>{tr('Devices observed', '已观测设备')}</th><th>{tr('Connection opens', '建立连接')}</th><th>{tr('Reconnects ≥', '重连数 ≥')}</th>
          </tr></thead><tbody>{state.windows.map(window => <tr key={window.minutes}>
            <td>{window.minutes === 1440 ? '24h' : window.minutes === 60 ? '1h' : '15m'}</td><td>{window.counts.observedDevices}</td><td>{window.counts.connections}</td><td>{window.counts.reconnects}</td>
          </tr>)}</tbody></table></div>
          <p>{tr('Observed lower bounds: a window’s first connection may already be a reconnect. Heartbeats show observations, not guaranteed uptime.', '观测值是下限：时段内首次连接也可能是重连。心跳表示曾被观测，不代表持续在线。')}</p>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr('Platform / Agent', '平台 / Agent')}</th><th>{tr('Devices', '设备数')}</th><th>{tr('Reconnects ≥ · 15m', '重连数 ≥ · 15 分钟')}</th></tr></thead>
            <tbody>{state.groups.map(group => <tr key={group.platform + ':' + group.agentVersion}><td>{group.platform} / {group.agentVersion}</td><td>{group.observedDevices}</td><td>{group.reconnects}</td></tr>)}</tbody>
          </table></div>
          {state.groupsTruncated && <p>{tr('Showing the top 20 groups; totals include every group.', '仅显示前 20 组，汇总包含所有分组。')}</p>}
          <details><summary>{tr('Recent minute-by-minute observations', '最近每分钟观测')}</summary>
            <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr('Time', '时间')}</th><th>{tr('Opens', '建立')}</th><th>{tr('Closes', '断开')}</th><th>{tr('Heartbeats', '心跳')}</th></tr></thead>
              <tbody>{state.trend.map(row => <tr key={row.minute}><td>{new Date(row.minute).toLocaleTimeString()}</td><td>{row.connections}</td><td>{row.disconnects}</td><td>{row.heartbeats}</td></tr>)}</tbody>
            </table></div>
          </details>
        </>}
  </article>;
}
