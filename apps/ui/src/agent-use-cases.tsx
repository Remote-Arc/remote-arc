import { useId, useState } from 'react';
import { useI18n } from './i18n.js';
import { ProductIcon as Icon } from './product-icon.js';
import { localizedWebsiteHref } from './marketing-paths.js';
import { arcChatHref } from '../../../packages/docs/src/arc-use-cases.js';
import { VideoEditingPreview, DeviceFleetPreview, PerformancePreview, WorkspacePreview } from './arc-connected-previews.js';
import './agent-use-cases.css';

export function AgentUseCases() {
  const { tr, locale } = useI18n();
  const [selected, setSelected] = useState(0);
  const uid = useId();
  const cases = [
    { id: 'fleet', icon: 'device', name: tr('Device fleet', '设备集群'), title: tr('Your whole fleet. One conversation.', '整个设备集群，一句话掌握。'), detail: tr('See which computers are online, choose the right machine and coordinate work across Mac, Windows and Linux.', '查看设备在线情况，选择合适的电脑，在 Mac、Windows 和 Linux 之间协调工作。'), prompt: tr('Show my connected devices and their status. Help me choose the right computer for my next task.', '查看我已连接的设备及在线状态，帮我为下一项任务选择合适的电脑。'), note: tr('One view across your connected computers.', '在一个视图中，掌握所有已连接电脑。'), brands: ['macos', 'windows', 'linux'] },
    { id: 'performance', icon: 'activity', name: tr('Performance', '设备性能'), title: tr('Know what your devices can handle.', '设备忙不忙，一问就知道。'), detail: tr('Ask about CPU, memory and disk space. Find the busy machine, spot a bottleneck and decide where the next job should run.', '询问 CPU、内存和磁盘空间，找出繁忙设备与性能瓶颈，为下一个任务安排合适的机器。'), prompt: tr('Check CPU, memory and free disk space on my Build PC using the available device tools. Summarize any bottlenecks.', '使用可用设备工具，检查 Build PC 的 CPU、内存和磁盘可用空间，汇总性能瓶颈。'), note: tr('Device snapshots, explained in plain language.', '把设备性能快照，变成清楚易懂的结论。'), brands: ['windows'] },
    { id: 'workspaces', icon: 'panel', name: tr('Workspaces', '工作区'), title: tr('Pick a project. Let Arc do the work.', '选好项目，让 Arc 接着做。'), detail: tr('Choose a project folder and a computer. Arc can read the files, make changes and run checks in that workspace.', '选择项目目录和执行电脑，Arc 就在这个工作区里读文件、改代码、跑测试。每个项目保留自己的文件和上下文。'), prompt: tr('Help me work in a project workspace. Confirm the computer, project folder and task, then make the requested changes and run the relevant checks.', '帮我在项目工作区里完成任务。先确认执行电脑、项目目录和目标，再完成修改并运行相关检查。'), note: tr('Your files and project context stay together.', '项目文件与工作上下文，始终在一起。'), brands: ['macos', 'linux'] },
    { id: 'video', icon: 'panel', name: tr('Video editing', '视频剪辑'), title: tr('Your clips. A story worth sharing.', '把零散片段，剪成一支好视频。'), detail: tr('Trim footage, combine clips and add subtitles with local video tools. Arc checks your source files and available tools, then renders the result on your computer.', '用本地视频工具裁剪素材、合并片段、添加字幕。Arc 先检查源文件和可用工具，再在你的电脑上渲染成片。'), prompt: tr('Edit the clips in my project folder into a 30-second video. Check the source files first, confirm the cuts, format and subtitles, then export an MP4 and verify the result on my computer.', '把项目目录里的素材剪成一支 30 秒视频。先检查源文件，确认剪辑顺序、画幅和字幕，再在我的电脑上导出 MP4 并检查成片。'), note: tr('Local video workflow · Your footage stays on your computer.', '本地视频工作流 · 素材留在你的电脑上。'), brands: ['macos', 'windows'] },
  ] as const;
  const current = cases[selected]!;
  return <section className="agentUseCases sectionBlock" id="agent-use-cases" aria-labelledby={uid + '-heading'}>
    <header className="modernSectionIntro"><span className="eyebrow">{tr('CONNECTED TO YOUR WORLD', '连接你的世界')}</span><h2 id={uid + '-heading'}>{tr('Give Arc something worth doing.', '把值得做的工作，交给 Arc。')}</h2><p>{tr('Your apps, your device fleet, your workspaces. Connect brings them together. Arc helps you put them to work.', '应用、设备集群、工作区。Connect 将它们连在一起，Arc 帮你把想法变成行动。')}</p></header>
    <div className="agentConnectedToolbar"><div className="agentConnectedTabs" role="tablist" aria-label={tr('Explore connected capabilities', '查看连接能力')}>{cases.map((item, index) => <button key={item.id} type="button" role="tab" id={uid + '-' + item.id} aria-controls={uid + '-panel'} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? cases.length - 1 : (selected + (event.key === 'ArrowRight' ? 1 : -1) + cases.length) % cases.length;
      setSelected(next); document.getElementById(uid + '-' + cases[next]!.id)?.focus();
    }}><Icon name={item.icon} size={15} />{item.name}</button>)}</div><span className="agentConnectedProducts"><span><Icon name="link" size={11} />Connect</span><i>+</i><span><img src="/remote-arc.svg" alt="" width={14} height={14} />Arc</span></span></div>
    <div className="agentConnectedPanel" role="tabpanel" id={uid + '-panel'} aria-labelledby={uid + '-' + current.id} data-workflow={current.id} tabIndex={0}>
      <div className="agentConnectedCopy"><div className="agentConnectedLogos">{current.brands.map(brand => <a key={brand} href={localizedWebsiteHref('/downloads', locale)} aria-label={tr('Connect ', '连接：') + brand}><img src={'/platform-brands/' + brand + '.svg'} alt={brand === 'macos' ? 'Mac' : brand === 'windows' ? 'Windows' : 'Linux'} width={24} height={24} /></a>)}</div><h3>{current.title}</h3><p>{current.detail}</p><div className="agentConnectedRequest"><Icon name="chat" size={15} /><span>“{current.prompt}”</span></div><a className="agentConnectedAction" href={arcChatHref(current.prompt, 'homepage-connected:' + current.id)}>{tr('Try it in Arc', '在 Arc 中体验')}<Icon name="arrowUpRight" size={15} /></a></div>
      <div className="agentConnectedVisual"><header><span><img src="/remote-arc.svg" alt="" width={18} height={18} />{'Arc / ' + current.name}</span><small>{tr('EXAMPLE WORKSPACE', '示例工作空间')}</small></header><div className="agentConnectedCanvas" key={current.id}>{selected === 0 ? <DeviceFleetPreview /> : selected === 1 ? <PerformancePreview /> : selected === 2 ? <WorkspacePreview /> : <VideoEditingPreview />}</div><footer><Icon name="check" size={13} /><span>{current.note}</span><small>{tr('Example data', '示例数据')}</small></footer></div>
    </div>
  </section>;
}
