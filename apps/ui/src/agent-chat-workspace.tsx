import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  arcChatTitle, loadArcChatSessions, saveArcChatSessions,
  type ArcChatSession, type ArcChatMessage,
} from "./arc-chat-sessions.js";
import "./agent-chat-workspace.css";

type Translate = (english: string, chinese: string) => string;
type Props = {
  tr: Translate;
  accountId: string;
  onlineDevices: number;
  connectedDevices?: number;
  onPrepareGoal: (objective: string, successCriteria: string) => void;
  onOpenGoals: () => void;
  onManageApps: () => void;
  onManageDevices: () => void;
  onManageSkills?: () => void;
  onCreateRoutine?: () => void;
};

const Icon = ({ name }: { name: "plus" | "search" | "apps" | "arrow" | "chat" | "check" | "trash" | "menu" | "history" | "close" | "device" | "spark" }) => {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<typeof name, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    apps: <><rect x="3.8" y="3.8" width="6.6" height="6.6" rx="1.3"/><rect x="13.6" y="3.8" width="6.6" height="6.6" rx="1.3"/><rect x="3.8" y="13.6" width="6.6" height="6.6" rx="1.3"/><rect x="13.6" y="13.6" width="6.6" height="6.6" rx="1.3"/></>,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6"/>,
    chat: <path d="M20.5 11.6a8.5 8.5 0 0 1-8.8 8.1 9 9 0 0 1-4.1-1L3.5 20l1.1-4.1a8.1 8.1 0 0 1-1.1-4.2 8.5 8.5 0 1 1 17 0Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v5m4-5v5"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    device: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>,
    spark: <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
};

const newId = () => crypto.randomUUID();
const newMessage = (role: ArcChatMessage["role"], content: string): ArcChatMessage => ({
  id: newId(), role, content,
});

export function AgentChatWorkspace({
  tr, accountId, onlineDevices, onPrepareGoal, onOpenGoals, onManageApps, onManageDevices, onManageSkills,
}: Props) {
  const [sessions, setSessions] = useState<ArcChatSession[]>(() => loadArcChatSessions(accountId));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarMount, setSidebarMount] = useState<Element | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(drawer.current?.querySelectorAll<HTMLElement>("button,input,a[href]") || []).filter(element => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key === "Tab") {
        const items=focusable(),first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",handleKey);
    return () => {document.removeEventListener("keydown",handleKey); if(previous?.isConnected)previous.focus();};
  },[mobileOpen]);

  useEffect(() => setSidebarMount(document.getElementById("arc-sidebar-nav-root")), []);
  useEffect(() => { saveArcChatSessions(accountId, sessions); }, [accountId, sessions]);
  const current = useMemo(() => sessions.find(session => session.id === activeId) || null, [activeId, sessions]);
  useEffect(() => { if (!scrollArea.current) return; if (!activeId) { scrollArea.current.scrollTop = 0; return; } scrollArea.current.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" }); }, [activeId, current?.messages.length]);

  const examples = [
    { icon: "device" as const, title: tr("Check my computers", "检查电脑状态"), detail: tr("Devices & ongoing work", "设备与持续工作"), text: tr("Check my connected computers and summarize what needs attention.", "检查已连接的电脑，整理需要处理的问题。") },
    { icon: "chat" as const, title: tr("Move a project forward", "推进项目工作"), detail: tr("Code, files & updates", "代码、文件与进展"), text: tr("Inspect my project, identify the next useful step and explain the expected result.", "检查我的项目，找到下一步最有用的工作，并说明预期结果。") },
    { icon: "history" as const, title: tr("Plan a routine", "安排例行工作"), detail: tr("Work that repeats", "持续推进例行任务"), text: tr("Set up a recurring check of my project and connected devices.", "安排定期检查项目和已连接设备的工作。") },
    { icon: "apps" as const, title: tr("Organize my work", "整理工作资料"), detail: tr("A clear next step", "形成清晰的下一步"), text: tr("Review my working directory and prepare a useful summary and next steps.", "检查我的工作目录，整理摘要与后续步骤。") },
  ];

  const beginNew = () => {
    setActiveId(null);
    setDraft("");
    setMobileOpen(false);
    requestAnimationFrame(() => editor.current?.focus());
  };

  const selectSession = (id: string) => {
    setActiveId(id);
    setDraft("");
    setMobileOpen(false);
  };

  const removeSession = (id: string) => {
    setSessions(previous => previous.filter(session => session.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const now = Date.now();
    if (!current) {
      const created: ArcChatSession = {
        id: newId(), title: arcChatTitle(value), createdAt: now, updatedAt: now,
        objective: value, criteria: "",
        messages: [
          newMessage("user", value),
          newMessage("assistant", tr(
            "I can prepare this as an approved goal. What result would count as success? Once you tell me, we'll review its execution details before running anything.",
            "我可以将它整理成需要确认的目标。什么样的结果算完成？告诉我之后，我们再审核执行方案，确认前不会运行任何操作。",
          )),
        ],
      };
      setSessions(previous => [created, ...previous].slice(0, 30));
      setActiveId(created.id);
    } else {
      setSessions(previous => previous.map(session => {
        if (session.id !== current.id) return session;
        const criteria = (session.criteria ? session.criteria + "\n" : "") + value;
        return {
          ...session, criteria: criteria.slice(0, 2000), updatedAt: now,
          messages: [...session.messages, newMessage("user", value), newMessage("assistant",
            session.criteria
              ? tr("I've added that to the success criteria. Review the goal when you're ready.", "已把这条要求补充进成功标准。准备好后可以检查执行方案。")
              : tr("Got it. Your goal draft is ready to review. Nothing will run until you approve the execution details.", "明白了。目标草稿已准备好审核，只有确认执行细节后才会开始操作。"),
          )].slice(-32),
        };
      }).sort((a, b) => b.updatedAt - a.updatedAt));
    }
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const sidebar = (mobile: boolean) => (
    <div className={"arcChatNavigation" + (mobile ? " arcChatNavigationMobile" : "")}>
      <button type="button" className="arcSidebarPrimary" onClick={beginNew}>
        <Icon name="plus"/><span>{tr("New chat", "新对话")}</span><span className="arcSidebarShortcut" aria-hidden="true">↵</span>
      </button>
      <button type="button" className="arcSidebarAction" onClick={() => setSearchOpen(!searchOpen)}>
        <Icon name="search"/><span>{tr("Search chats", "搜索对话")}</span>
      </button>
      {searchOpen && <label className="arcSidebarSearch">
        <span className="arcSrOnly">{tr("Search your chats", "搜索你的对话")}</span>
        <input autoFocus type="search" placeholder={tr("Search chats…", "搜索对话…")} value={search} onChange={e => setSearch(e.target.value)}/>
      </label>}
      <button type="button" className="arcSidebarAction" onClick={onOpenGoals}><Icon name="history"/><span>{tr("Tasks", "任务")}</span></button>
      <div className="arcSidebarSectionTitle">{tr("TOOLS", "工具")}</div>
      <button type="button" className="arcSidebarAction" onClick={onManageApps}><Icon name="apps"/><span>{tr("Apps", "应用")}</span></button>
      <button type="button" className="arcSidebarAction" onClick={onManageDevices}><Icon name="device"/><span>{tr("Devices", "设备")}</span></button>
      {onManageSkills && <button type="button" className="arcSidebarAction" onClick={onManageSkills}><Icon name="spark"/><span>{tr("Skills", "技能")}</span></button>}
      <div className="arcSidebarSectionTitle">{tr("RECENT CHATS", "最近对话")}</div>
      <div className="arcSessionList">
        {sessions.filter(session => session.title.toLowerCase().includes(search.trim().toLowerCase())).length ? sessions
          .filter(session => session.title.toLowerCase().includes(search.trim().toLowerCase()))
          .map(session => <div key={session.id} className={"arcSessionRow" + (session.id === activeId ? " selected" : "")}>
            <button type="button" className="arcSessionOpen" title={session.title} aria-current={session.id === activeId ? "page" : undefined} onClick={() => selectSession(session.id)}>
              <Icon name="chat"/><span>{session.title}</span>
            </button>
            <button type="button" className="arcSessionDelete" aria-label={tr("Delete local chat", "删除本地对话") + ": " + session.title} onClick={() => removeSession(session.id)}><Icon name="trash"/></button>
          </div>)
          : <div className="arcSidebarEmpty">{search ? tr("No matching chats", "没有匹配的对话") : tr("Your drafts will appear here", "你的对话草稿会出现在这里")}</div>}
      </div>
      <div className="arcSidebarLocalNotice">{tr("Drafts are saved in this browser tab.", "对话草稿仅保存在当前浏览器标签页。")}</div>
    </div>
  );

  const composer = (
<div className="arcChatBottom">
        <form className="arcChatComposer" onSubmit={submit}>
          <label className="arcSrOnly" htmlFor="arc-chat-input">{tr("Message Arc Agent", "发送消息给 Arc Agent")}</label>
          <textarea ref={editor} id="arc-chat-input" rows={2} maxLength={current?.criteria ? 2000 : 6000} value={draft}
            placeholder={current ? current.criteria ? tr("Add more success details…", "补充成功标准…") : tr("Describe what success looks like…", "描述什么样的结果算完成…") : tr("Message Arc Agent…", "向 Arc Agent 发送消息…")}
            onChange={e => setDraft(e.target.value)} onKeyDown={onKeyDown}/>
          <div className="arcChatComposerBottom">
            <div className="arcChatTools">
              <button type="button" onClick={onManageDevices} title={tr("Manage device fleet", "管理设备集群")}><span className={"arcChatOnline" + (onlineDevices ? " online" : "")}/>{onlineDevices} {onlineDevices === 1 ? tr("device", "台设备") : tr("devices", "台设备")}</button>
              <button type="button" onClick={onManageApps}><Icon name="apps"/>{tr("Apps", "应用")}</button>
            </div>
            <button type="submit" className="arcChatSend" disabled={!draft.trim()} aria-label={tr("Send message", "发送消息")}><Icon name="arrow"/></button>
          </div>
        </form>
        <p className="arcChatDisclaimer">{tr("Goal draft mode · AI conversations are still being connected.", "目标草稿模式 · AI 对话连接仍在开发中。")}</p>
      </div>
  );

  return (
    <section className="arcChatShell" data-state={current ? "conversation" : "welcome"} aria-label={tr("Arc Agent chat", "Arc Agent 对话")}>
      {sidebarMount && createPortal(sidebar(false), sidebarMount)}
      <header className="arcChatTopbar">
        <div className="arcChatTopLeft">
          <button type="button" className="arcChatMobileMenu" aria-label={tr("Open chat history", "打开对话历史")} onClick={() => setMobileOpen(true)}><Icon name="menu"/></button>
          <span className="arcChatBrand">Arc</span><span className="arcChatBeta">{tr("Draft mode", "草稿模式")}</span>
        </div>
        <div className="arcChatTopRight">
          <button type="button" className="arcChatTopLink" onClick={onOpenGoals}><Icon name="history"/>{tr("Tasks", "任务")}</button>
          <button type="button" className="arcChatTopNew" onClick={beginNew} aria-label={tr("New chat", "新对话")}><Icon name="plus"/></button>
        </div>
      </header>

      <div className="arcChatScroll" ref={scrollArea}>
        {!current
          ? <div className="arcChatWelcome">
            <div className="arcChatStar" aria-hidden="true"><img src="/remote-arc.svg" alt="" /></div>
            <h1>{tr("Let’s get to work.", "一起，把事情做好。")}</h1>
            <p>{tr("Your apps, your computers, your next step. All in one conversation.", "连接你的应用与电脑，在一次对话里推进工作。")}</p>
            {composer}
            <div className="arcChatIdeas">
              {examples.map(example => <button type="button" className="arcChatIdea" key={example.title} onClick={() => { setDraft(example.text); editor.current?.focus(); }}>
                <span className="arcChatIdeaIcon"><Icon name={example.icon}/></span><strong>{example.title}</strong><span>{example.detail}</span><span className="arcChatIdeaArrow" aria-hidden="true">↗</span>
              </button>)}
            </div>
          </div>
          : <div className="arcChatMessages" role="log" aria-label={tr("Chat messages", "对话消息")} aria-live="polite">
            {current.messages.map(message => <div key={message.id} className={"arcChatMessage " + message.role}>
              {message.role === "assistant" && <span className="arcMessageAvatar"><Icon name="spark"/></span>}
              <div className="arcMessageBody"><span className="arcMessageText">{message.content}</span></div>
            </div>)}
            {current.criteria && <div className="arcChatReviewPanel">
              <div className="arcChatReviewTop"><Icon name="check"/><strong>{tr("Goal ready for review", "目标已准备好审核")}</strong></div>
              <div className="arcChatReviewSummary"><strong>{tr("Objective", "目标")}</strong><p>{current.objective}</p><strong>{tr("Success criteria", "成功标准")}</strong><p>{current.criteria}</p></div>
              <button type="button" className="arcChatReviewButton" onClick={() => onPrepareGoal(current.objective, current.criteria)}>
                {tr("Review execution", "审核执行方案")} <span aria-hidden="true">↗</span>
              </button>
              <p>{tr("Device, permissions and cost must be reviewed before any execution.", "执行前仍需确认设备、权限和费用。")}</p>
            </div>}
          </div>}
      </div>

      {current && composer}

      {mobileOpen && <div className="arcChatMobileBackdrop" role="presentation" onClick={() => setMobileOpen(false)}>
        <div ref={drawer} className="arcChatMobileDrawer" role="dialog" aria-modal="true" aria-label={tr("Chat history", "对话历史")} onClick={event => event.stopPropagation()}>
          <div className="arcMobileDrawerHeader"><strong>Arc Agent</strong><button type="button" aria-label={tr("Close", "关闭")} onClick={() => setMobileOpen(false)}><Icon name="close"/></button></div>
          {sidebar(true)}
        </div>
      </div>}
    </section>
  );
}
