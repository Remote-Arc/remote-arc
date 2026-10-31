import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useI18n } from '../../../app/i18n.js';
import { localizedWebsiteHref } from '../../../lib/marketing-paths.js';
import { ProductIcon as Icon } from '../../../components/product-icon.js';
import { arcChatHref } from '../../../../../../packages/docs/src/arc-use-cases.js';
import './arc-connected-previews.css';
import './arc-connected-workspace.css';
import './connected-video-edit.css';

export const previewDevices = [
  { name: 'Studio Mac', platform: 'macos', system: 'macOS', cpu: 24, memory: '12.8 / 32 GB', state: 'online' },
  { name: 'Build PC', platform: 'windows', system: 'Windows', cpu: 68, memory: '21.4 / 64 GB', state: 'online' },
  { name: 'Linux Server', platform: 'linux', system: 'Ubuntu', cpu: 12, memory: '4.2 / 16 GB', state: 'online' },
  { name: 'Travel Mac', platform: 'macos', system: 'macOS', cpu: 0, memory: '—', state: 'offline' },
] as const;

export function DeviceFleetPreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  return <div className={'connectedFleet' + (compact ? ' connectedFleet--compact' : '')}>
    <div className="connectedFleetSummary"><span><i className="connectedOnlineDot" />{tr('3 online', '3 台在线')}</span><span>{tr('1 offline', '1 台离线')}</span><span>{tr('4 devices', '4 台设备')}</span></div>
    <div className="connectedDeviceList">{previewDevices.slice(0, compact ? 3 : 4).map(device => <div className="connectedDevice" key={device.name} data-state={device.state}>
      <span className="connectedPlatform"><img src={'/platform-brands/' + device.platform + '.svg'} width={23} height={23} alt={device.system} /></span>
      <div><strong>{device.name}</strong><small>{device.system} · {device.state === 'online' ? tr('Connected', '已连接') : tr('Last seen 2h ago', '2 小时前在线')}</small></div>
      <span className="connectedDeviceState">{device.state === 'online' ? <><i className="connectedOnlineDot" />{tr('Online', '在线')}</> : tr('Offline', '离线')}</span>
    </div>)}</div>
  </div>;
}

export function PerformancePreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  return <div className={'connectedPerformance' + (compact ? ' connectedPerformance--compact' : '')}>
    <div className="connectedPerformanceHead"><span className="connectedPlatform"><img src="/platform-brands/windows.svg" alt="Windows" width={22} height={22} /></span><div><strong>Build PC</strong><small>{tr('Performance snapshot', '性能快照')}</small></div><span><i className="connectedOnlineDot" />{tr('Online', '在线')}</span></div>
    <div className="connectedMetrics">{[{ label: 'CPU', value: '68', unit: '%', width: 68 }, { label: tr('Memory', '内存'), value: '21.4', unit: '/ 64 GB', width: 33 }, { label: tr('Disk', '磁盘'), value: '426', unit: 'GB free', width: 58 }].map(metric => <div key={metric.label}><small>{metric.label}</small><strong>{metric.value}<span>{metric.unit === 'GB free' ? tr('GB free', 'GB 可用') : metric.unit}</span></strong><span className="connectedMetricTrack"><i style={{ '--metric-width': metric.width + '%' } as CSSProperties} /></span></div>)}</div>
    {!compact && <div className="connectedChart"><div><span>{tr('CPU activity', 'CPU 活动')}</span><span>{tr('Last 60 seconds · example', '最近 60 秒 · 示例')}</span></div><svg viewBox="0 0 500 100" role="img" aria-label={tr('Example CPU activity chart', 'CPU 活动示例图表')} preserveAspectRatio="none"><path className="connectedChartGrid" d="M0 20H500M0 50H500M0 80H500" /><path className="connectedChartArea" d="M0 82 20 78 40 80 60 62 80 65 100 50 120 58 140 66 160 40 180 48 200 25 220 35 240 20 260 31 280 54 300 49 320 38 340 44 360 25 380 32 400 18 420 38 440 30 460 40 480 25 500 32V100H0Z" /><path className="connectedChartLine" d="M0 82 20 78 40 80 60 62 80 65 100 50 120 58 140 66 160 40 180 48 200 25 220 35 240 20 260 31 280 54 300 49 320 38 340 44 360 25 380 32 400 18 420 38 440 30 460 40 480 25 500 32" /></svg></div>}
  </div>;
}

export function WorkspacePreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  const [project, setProject] = useState(0);
  const [device, setDevice] = useState<'mac' | 'windows'>('mac');
  const [result, setResult] = useState(false);
  const projects = [{ name: tr('Website project', '官网项目'), folder: 'remote-arc', task: tr('Fix the login button layout, then run the project tests.', '修复登录按钮的布局，然后运行项目测试。'), output: 'login-fix.md', checks: tr('12 tests passed', '12 项测试通过') }, { name: tr('Sales report', '销售报表'), folder: 'sales-report', task: tr('Summarize this month’s orders and generate an Excel report.', '汇总本月订单，生成一份 Excel 销售报表。'), output: 'monthly-sales.xlsx', checks: tr('Totals reconciled', '订单合计已核对') }];
  const current = projects[project]!;
  const directory = device === 'mac' ? '~/Projects/' + current.folder : 'D:\\Projects\\' + current.folder;
  if (!compact) return <div className="connectedWorkspaceFlow">
    <div className="connectedWorkspaceStep"><span>01</span><strong>{tr('Choose a project', '选择项目')}</strong></div>
    <div className="connectedProjectChoices" role="group" aria-label={tr('Example project', '示例项目')}>{projects.map((item, index) => <button key={item.folder} type="button" aria-pressed={project === index} onClick={() => { setProject(index); setResult(false); }}><Icon name={index === 0 ? 'panel' : 'chart'} size={16} /><span>{item.name}</span></button>)}</div>
    <div className="connectedWorkspaceStep"><span>02</span><strong>{tr('Choose the computer', '选择执行电脑')}</strong></div>
    <div className="connectedWorkspaceMachines" role="group" aria-label={tr('Example workspace computer', '示例工作区电脑')}>{(['mac', 'windows'] as const).map(value => <button key={value} type="button" aria-pressed={device === value} onClick={() => { setDevice(value); setResult(false); }}><img src={'/platform-brands/' + (value === 'mac' ? 'macos' : 'windows') + '.svg'} width={17} height={17} alt="" /><span>{value === 'mac' ? 'Studio Mac' : 'Build PC'}</span><i className="connectedOnlineDot" /></button>)}</div>
    <div className="connectedWorkspaceJob"><header><Icon name="panel" size={14} /><code>{directory}</code><span>{tr('WORKSPACE', '当前工作区')}</span></header><div><span className="connectedWorkspaceStep"><span>03</span><strong>{tr('Tell Arc what to do here', '交代这个项目里的任务')}</strong></span><p><img src="/remote-arc.svg" width={22} height={22} alt="Arc" /><span>{current.task}</span></p><button className="connectedWorkspaceRun" type="button" onClick={() => setResult(!result)}>{result ? tr('Back to task', '返回任务') : tr('See example result', '查看示例结果')}<Icon name={result ? 'refresh' : 'arrowUpRight'} size={13} /></button></div><footer aria-live="polite">{result ? <><Icon name="check" size={14} /><span><strong>{current.output}</strong>{current.checks}</span></> : <><Icon name="shield" size={14} /><span>{tr('Arc works in this project folder, with its own files and context.', 'Arc 在这个项目目录里工作，文件和上下文随项目保留。')}</span></>}</footer></div>
  </div>;
  return <div className="connectedWorkspaces connectedWorkspaces--compact">
    <div className="connectedWorkspacePath"><Icon name="panel" size={15} /><span>Studio Mac</span><span>/</span><strong>Workspaces</strong></div>
    {[{ name: 'remote-arc', detail: tr('App & website', '应用与网站'), path: '~/Projects/remote-arc', branch: 'main', color: 'blue' }, { name: 'design-system', detail: tr('Components & brand', '组件与品牌'), path: '~/Projects/design-system', branch: 'design/v2', color: 'violet' }, { name: 'research', detail: tr('Notes & browser work', '笔记与浏览器任务'), path: '~/Work/research', branch: '—', color: 'green' }].slice(0, compact ? 2 : 3).map(project => <div className="connectedWorkspace" key={project.name}><span data-color={project.color}><Icon name="panel" size={19} /></span><div><strong>{project.name}</strong><small>{compact ? project.detail : project.path}</small></div><code>{project.branch}</code></div>)}
    {!compact && <div className="connectedWorkspaceNote"><Icon name="link" size={14} />{tr('The right project. On the right computer.', '选对项目，交给合适的电脑。')}</div>}
  </div>;
}

export function VideoEditingPreview() {
  const { tr } = useI18n();
  const [portrait, setPortrait] = useState(false);
  const [review, setReview] = useState(false);
  return <div className="connectedVideoEdit">
    <header><span className="connectedWindowDots"><i /><i /><i /></span><span>weekend-cut</span><small>{tr('LOCAL PROJECT', '本地项目')}</small></header>
    <div className="connectedEditStage" data-format={portrait ? 'portrait' : 'landscape'}>
      <div className="connectedEditPicture" aria-hidden="true"><span className="connectedEditSun"/><span className="connectedEditHills"/><span className="connectedEditTitle">WEEKEND<br/>STORIES</span><small>00:12 / 00:30</small></div>
      <span className="connectedEditCaption">{tr('Keep the moments that matter.', '留下值得记住的瞬间。')}</span>
    </div>
    <div className="connectedEditTracks">
      <div className="connectedEditRuler"><span>00:00</span><span>00:15</span><span>00:30</span></div>
      <div className="connectedEditClips" aria-label={tr('Three example clips', '三个示例片段')}>{['01','02','03'].map((clip,index)=><span key={clip} data-clip={index}><Icon name="panel" size={13}/><span>clip-{clip}.mp4</span></span>)}</div>
      <div className="connectedEditSubtitles"><Icon name="chat" size={12}/>{tr('Subtitle track', '字幕轨道')}<span>00:00 — 00:30</span></div>
    </div>
    <div className="connectedEditControls"><div role="group" aria-label={tr('Video format', '视频画幅')}>{[false,true].map(value=><button type="button" key={String(value)} aria-pressed={portrait===value} onClick={()=>{setPortrait(value);setReview(false);}}>{value?'9:16':'16:9'}</button>)}</div><button className="connectedEditReview" type="button" onClick={()=>setReview(!review)}>{review?tr('Adjust the edit','调整剪辑'):tr('Review export plan','查看导出方案')}<Icon name={review?'refresh':'arrowUpRight'} size={13}/></button></div>
    <div className="connectedEditResult" aria-live="polite"><Icon name={review?'check':'device'} size={15}/><span>{review?tr(`Export plan: 30s MP4 · ${portrait?'1080 × 1920':'1920 × 1080'} · subtitles.`, `导出方案：30 秒 MP4 · ${portrait?'1080 × 1920':'1920 × 1080'} · 字幕。`):tr('Trim, combine and subtitle on your computer.', '在你的电脑上裁剪、合并并添加字幕。')}</span></div>
  </div>;
}

export function SlackAgentPreview() {
  const { tr, locale } = useI18n();
  const uid = useId();
  const [scenario, setScenario] = useState(0);
  const [input, setInput] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const questions = [tr('How are my devices doing?', '我的设备现在怎么样？'), tr('Check the performance of my Build PC.', '看看 Build PC 的性能情况。'), tr('Show me my connected workspaces.', '查看我已连接的工作区。')];
  const select = (index: number) => { setScenario(index); setCustomQuestion(''); setUnsupported(false); setInput(''); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    const query = input.trim();
    const index = /workspace|project|工作区|项目/i.test(query) ? 2 : /performance|cpu|memory|性能|内存/i.test(query) ? 1 : /device|online|computer|status|设备|电脑|在线|状态/i.test(query) ? 0 : -1;
    setCustomQuestion(query); setUnsupported(index < 0); if (index >= 0) setScenario(index); setInput('');
  };
  return <div className="slackAgentPreview" aria-label={tr('Slack-style Remote Arc chat demo', 'Slack 风格的 Remote Arc 对话演示')}>
    <header className="slackTitlebar"><a href={localizedWebsiteHref('/integrations?provider=slack', locale)} aria-label={tr('Explore Slack integration', '了解 Slack 集成')}><img src="/app-brands/slack.svg" width={16} height={16} alt="Slack" /></a><span><Icon name="search" size={12} />{tr('Search your workspace', '搜索你的工作空间')}</span><span className="connectedWindowDots" aria-hidden="true"><i /><i /><i /></span></header>
    <div className="slackPreviewBody"><aside className="slackSidebar"><div className="slackWorkspaceName">Arc workspace<Icon name="chevron" size={13} /></div><a href={localizedWebsiteHref('/arc', locale)}><Icon name="inbox" size={14} />{tr('Activity', '动态')}</a><small>{tr('CHANNELS', '频道')}</small><span className="slackChannel"># {tr('general', '日常交流')}</span><span className="slackChannel"># {tr('device-ops', '设备运维')}</span><small>{tr('DIRECT MESSAGES', '私信')}</small><div className="slackSelectedDm"><img src="/remote-arc.svg" alt="" width={17} height={17} />Remote Arc<i className="connectedOnlineDot" /></div><div className="slackSidebarFooter"><i className="connectedOnlineDot" />{tr('Your fleet, one message away.', '一句话，连接你的设备。')}</div></aside>
      <div className="slackConversation"><header className="slackConversationHeader"><a href={localizedWebsiteHref('/arc', locale)}><span className="slackArcAvatar"><img src="/remote-arc.svg" width={23} height={23} alt="" /></span><div><strong>Remote Arc</strong><small><i className="connectedOnlineDot" />{tr('Your personal agent', '你的个人智能体')}</small></div></a><span className="slackAppBadge">APP</span></header>
        <div className="slackMessages" aria-live="polite"><div className="slackDayDivider"><span>{tr('Today', '今天')}</span></div><div className="slackMessage"><span className="slackUserAvatar">Y</span><div><div className="slackMessageAuthor"><strong>{tr('You', '你')}</strong><time>9:41</time></div><p>{customQuestion || questions[scenario]}</p></div></div><div className="slackMessage"><span className="slackArcAvatar"><img src="/remote-arc.svg" width={25} height={25} alt="" /></span><div className="slackAgentMessage"><div className="slackMessageAuthor"><strong>Remote Arc</strong><span className="slackAppBadge">APP</span><time>9:41</time></div><p>{unsupported ? tr('This preview supports device status, performance and workspaces. Open Arc to continue with your own request.', '此预览支持设备状态、性能和工作区。打开 Arc 可继续处理你的实际请求。') : scenario === 0 ? tr('Your fleet is looking good. Here’s the overview.', '设备集群状态良好，这是当前概览。') : scenario === 1 ? tr('Here’s the latest snapshot for your Build PC.', '这是 Build PC 的最新性能快照。') : tr('Here are the workspaces on your Studio Mac.', '这是 Studio Mac 上的工作区。')}</p>{!unsupported && <div className="slackResultCard">{scenario === 0 ? <DeviceFleetPreview compact /> : scenario === 1 ? <PerformancePreview compact /> : <WorkspacePreview compact />}</div>}</div></div></div>
        <div className="slackQuickPrompts" role="group" aria-label={tr('Try a device question', '试试设备问题')}>{[tr('Device status', '设备状态'), tr('Performance', '查看性能'), tr('Workspaces', '工作区')].map((label, index) => <button type="button" key={index} aria-pressed={!unsupported && scenario === index} onClick={() => select(index)}>{label}</button>)}</div>
        <form className="slackComposer" onSubmit={submit}><label htmlFor={uid} className="srOnly">{tr('Message Remote Arc demo', '给 Remote Arc 发送演示消息')}</label><input id={uid} value={input} onChange={event => setInput(event.target.value)} placeholder={tr('Ask about your devices…', '问问你的设备情况…')} maxLength={500} /><div><span><Icon name="add" size={15} /><strong>Aa</strong><span>@</span></span><button type="submit" disabled={!input.trim()} aria-label={tr('Send demo message', '发送演示消息')}><Icon name="arrowUp" size={15} /></button></div></form>
        <footer className="slackPreviewFootnote"><span>{tr('Interactive preview · Example data', '交互预览 · 示例数据')}</span><a href={arcChatHref(customQuestion || questions[scenario]!, 'homepage-slack-preview')}>{tr('Try in Arc', '在 Arc 中体验')}<Icon name="arrowUpRight" size={11} /></a></footer>
      </div></div>
  </div>;
}
