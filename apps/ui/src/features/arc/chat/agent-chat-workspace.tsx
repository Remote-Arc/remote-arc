import type { Translate } from "../../../locales/locale-catalog.js";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  arcChatTitle,
  loadArcChatSessions,
  saveArcChatSessions,
  type ArcChatSession,
  type ArcChatMessage,
} from "./arc-chat-sessions.js";
import "../../../styles/arc/chat/agent-chat-workspace.css";

type Props = {
  tr: Translate;
  accountId: string;
  onlineDevices: number;
  connectedDevices?: number;
  onPrepareGoal: (objective: string, successCriteria: string) => void;
  onOpenGoals: () => void;
  onOpenActivity: () => void;
  onOpenSettings: () => void;
  onManageApps: () => void;
  onManageDevices: () => void;
  onManageSkills?: () => void;
  onCreateRoutine?: () => void;
};

const Icon = ({
  name,
}: {
  name:
    | "plus"
    | "search"
    | "apps"
    | "arrow"
    | "chat"
    | "check"
    | "trash"
    | "menu"
    | "history"
    | "close"
    | "device"
    | "spark"
    | "activity"
    | "settings";
}) => {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<typeof name, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 5 5" />
      </>
    ),
    apps: (
      <>
        <rect x="3.8" y="3.8" width="6.6" height="6.6" rx="1.3" />
        <rect x="13.6" y="3.8" width="6.6" height="6.6" rx="1.3" />
        <rect x="3.8" y="13.6" width="6.6" height="6.6" rx="1.3" />
        <rect x="13.6" y="13.6" width="6.6" height="6.6" rx="1.3" />
      </>
    ),
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    chat: (
      <path d="M20.5 11.6a8.5 8.5 0 0 1-8.8 8.1 9 9 0 0 1-4.1-1L3.5 20l1.1-4.1a8.1 8.1 0 0 1-1.1-4.2 8.5 8.5 0 1 1 17 0Z" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v5m4-5v5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    device: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    spark: <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z" />,
    activity: <path d="M2 12h4l3-8 6 16 3-8h4" />,
    settings: (
      <>
        <path d="m10 3-.5 2.3-2 .9-2-.9L3 9l1.6 1.7v2.6L3 15l2.5 3.7 2-.9 2 .9L10 21h4l.5-2.3 2-.9 2 .9L21 15l-1.6-1.7v-2.6L21 9l-2.5-3.7-2 .9-2-.9L14 3Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
};

const newId = () => crypto.randomUUID();
const newMessage = (role: ArcChatMessage["role"], content: string): ArcChatMessage => ({
  id: newId(),
  role,
  content,
});

export function AgentChatWorkspace({
  tr,
  accountId,
  onlineDevices,
  onPrepareGoal,
  onOpenGoals,
  onOpenActivity,
  onOpenSettings,
  onManageApps,
  onManageDevices,
  onManageSkills,
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
    const focusable = () =>
      Array.from(
        drawer.current?.querySelectorAll<HTMLElement>("button,input,a[href]") || [],
      ).filter((element) => !element.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }
      if (event.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [mobileOpen]);

  useEffect(() => setSidebarMount(document.getElementById("arc-sidebar-nav-root")), []);
  useEffect(() => {
    saveArcChatSessions(accountId, sessions);
  }, [accountId, sessions]);
  const current = useMemo(
    () => sessions.find((session) => session.id === activeId) || null,
    [activeId, sessions],
  );
  useEffect(() => {
    if (!scrollArea.current) return;
    if (!activeId) {
      scrollArea.current.scrollTop = 0;
      return;
    }
    scrollArea.current.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" });
  }, [activeId, current?.messages.length]);

  const examples = [
    {
      icon: "device" as const,
      title: tr("arc.chat.agentChatWorkspace.checkMyComputers"),
      detail: tr("arc.chat.agentChatWorkspace.devicesOngoingWork"),
      text: tr("arc.chat.agentChatWorkspace.checkMyConnectedComputersAndSummarize"),
    },
    {
      icon: "chat" as const,
      title: tr("arc.chat.agentChatWorkspace.moveAProjectForward"),
      detail: tr("arc.chat.agentChatWorkspace.codeFilesUpdates"),
      text: tr("arc.chat.agentChatWorkspace.inspectMyProjectIdentifyTheNext"),
    },
    {
      icon: "history" as const,
      title: tr("arc.chat.agentChatWorkspace.planARoutine"),
      detail: tr("arc.chat.agentChatWorkspace.workThatRepeats"),
      text: tr("arc.chat.agentChatWorkspace.setUpARecurringCheckOf"),
    },
    {
      icon: "apps" as const,
      title: tr("arc.chat.agentChatWorkspace.organizeMyWork"),
      detail: tr("arc.chat.agentChatWorkspace.aClearNextStep"),
      text: tr("arc.chat.agentChatWorkspace.reviewMyWorkingDirectoryAndPrepare"),
    },
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
    setSessions((previous) => previous.filter((session) => session.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const now = Date.now();
    if (!current) {
      const created: ArcChatSession = {
        id: newId(),
        title: arcChatTitle(value),
        createdAt: now,
        updatedAt: now,
        objective: value,
        criteria: "",
        messages: [
          newMessage("user", value),
          newMessage("assistant", tr("arc.chat.agentChatWorkspace.iCanPrepareThisAsAn")),
        ],
      };
      setSessions((previous) => [created, ...previous].slice(0, 30));
      setActiveId(created.id);
    } else {
      setSessions((previous) =>
        previous
          .map((session) => {
            if (session.id !== current.id) return session;
            const criteria = (session.criteria ? session.criteria + "\n" : "") + value;
            return {
              ...session,
              criteria: criteria.slice(0, 2000),
              updatedAt: now,
              messages: [
                ...session.messages,
                newMessage("user", value),
                newMessage(
                  "assistant",
                  session.criteria
                    ? tr("arc.chat.agentChatWorkspace.iVeAddedThatToThe")
                    : tr("arc.chat.agentChatWorkspace.gotItYourGoalDraftIs"),
                ),
              ].slice(-32),
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
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
        <Icon name="plus" />
        <span>{tr("arc.chat.agentChatWorkspace.newChat")}</span>
        <span className="arcSidebarShortcut" aria-hidden="true">
          ↵
        </span>
      </button>
      <button type="button" className="arcSidebarAction" onClick={() => setSearchOpen(!searchOpen)}>
        <Icon name="search" />
        <span>{tr("arc.chat.agentChatWorkspace.searchChats")}</span>
      </button>
      {searchOpen && (
        <label className="arcSidebarSearch">
          <span className="arcSrOnly">{tr("arc.chat.agentChatWorkspace.searchYourChats")}</span>
          <input
            autoFocus
            type="search"
            placeholder={tr("arc.chat.agentChatWorkspace.searchChats2")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <button type="button" className="arcSidebarAction" onClick={onOpenGoals}>
        <Icon name="history" />
        <span>{tr("arc.chat.agentChatWorkspace.tasks")}</span>
      </button>
      <button type="button" className="arcSidebarAction" onClick={onOpenActivity}>
        <Icon name="activity" />
        <span>{tr("arc.chat.agentChatWorkspace.activity")}</span>
      </button>
      <div className="arcSidebarSectionTitle">{tr("arc.chat.agentChatWorkspace.tools")}</div>
      <button type="button" className="arcSidebarAction" onClick={onManageApps}>
        <Icon name="apps" />
        <span>{tr("arc.chat.agentChatWorkspace.apps")}</span>
      </button>
      <button type="button" className="arcSidebarAction" onClick={onManageDevices}>
        <Icon name="device" />
        <span>{tr("arc.chat.agentChatWorkspace.devices")}</span>
      </button>
      {onManageSkills && (
        <button type="button" className="arcSidebarAction" onClick={onManageSkills}>
          <Icon name="spark" />
          <span>{tr("arc.chat.agentChatWorkspace.skills")}</span>
        </button>
      )}
      <div className="arcSidebarSectionTitle">{tr("arc.chat.agentChatWorkspace.recentChats")}</div>
      <div className="arcSessionList">
        {sessions.filter((session) =>
          session.title.toLowerCase().includes(search.trim().toLowerCase()),
        ).length ? (
          sessions
            .filter((session) => session.title.toLowerCase().includes(search.trim().toLowerCase()))
            .map((session) => (
              <div
                key={session.id}
                className={"arcSessionRow" + (session.id === activeId ? " selected" : "")}
              >
                <button
                  type="button"
                  className="arcSessionOpen"
                  title={session.title}
                  aria-current={session.id === activeId ? "page" : undefined}
                  onClick={() => selectSession(session.id)}
                >
                  <Icon name="chat" />
                  <span>{session.title}</span>
                </button>
                <button
                  type="button"
                  className="arcSessionDelete"
                  aria-label={
                    tr("arc.chat.agentChatWorkspace.deleteLocalChat") + ": " + session.title
                  }
                  onClick={() => removeSession(session.id)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))
        ) : (
          <div className="arcSidebarEmpty">
            {search
              ? tr("arc.chat.agentChatWorkspace.noMatchingChats")
              : tr("arc.chat.agentChatWorkspace.yourDraftsWillAppearHere")}
          </div>
        )}
      </div>
      <div className="arcSidebarLocalNotice">
        {tr("arc.chat.agentChatWorkspace.draftsAreSavedInThisBrowser")}
      </div>
      {mobile && (
        <button type="button" className="arcSidebarAction" onClick={onOpenSettings}>
          <Icon name="settings" />
          <span>{tr("arc.chat.agentChatWorkspace.settings")}</span>
        </button>
      )}
    </div>
  );

  const composer = (
    <div className="arcChatBottom">
      <form className="arcChatComposer" onSubmit={submit}>
        <label className="arcSrOnly" htmlFor="arc-chat-input">
          {tr("arc.chat.agentChatWorkspace.messageArcAgent")}
        </label>
        <textarea
          ref={editor}
          id="arc-chat-input"
          rows={2}
          maxLength={current?.criteria ? 2000 : 6000}
          value={draft}
          placeholder={
            current
              ? current.criteria
                ? tr("arc.chat.agentChatWorkspace.addMoreSuccessDetails")
                : tr("arc.chat.agentChatWorkspace.describeWhatSuccessLooksLike")
              : tr("arc.chat.agentChatWorkspace.messageArcAgent2")
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="arcChatComposerBottom">
          <div className="arcChatTools">
            <button
              type="button"
              onClick={onManageDevices}
              title={tr("arc.chat.agentChatWorkspace.manageDeviceFleet")}
            >
              <span className={"arcChatOnline" + (onlineDevices ? " online" : "")} />
              {onlineDevices}{" "}
              {onlineDevices === 1
                ? tr("arc.chat.agentChatWorkspace.device")
                : tr("arc.chat.agentChatWorkspace.devices2")}
            </button>
            <button type="button" onClick={onManageApps}>
              <Icon name="apps" />
              {tr("arc.chat.agentChatWorkspace.apps")}
            </button>
          </div>
          <button
            type="submit"
            className="arcChatSend"
            disabled={!draft.trim()}
            aria-label={tr("arc.chat.agentChatWorkspace.sendMessage")}
          >
            <Icon name="arrow" />
          </button>
        </div>
      </form>
      <p className="arcChatDisclaimer">
        {tr("arc.chat.agentChatWorkspace.goalDraftModeAiConversationsAre")}
      </p>
    </div>
  );

  return (
    <section
      className="arcChatShell"
      data-state={current ? "conversation" : "welcome"}
      aria-label={tr("arc.chat.agentChatWorkspace.arcAgentChat")}
    >
      {sidebarMount && createPortal(sidebar(false), sidebarMount)}
      <header className="arcChatTopbar">
        <div className="arcChatTopLeft">
          <button
            type="button"
            className="arcChatMobileMenu"
            aria-label={tr("arc.chat.agentChatWorkspace.openChatHistory")}
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="arcChatBrand">Arc</span>
          <span className="arcChatBeta">{tr("arc.chat.agentChatWorkspace.draftMode")}</span>
        </div>
        <div className="arcChatTopRight">
          <button type="button" className="arcChatTopLink" onClick={onOpenGoals}>
            <Icon name="history" />
            {tr("arc.chat.agentChatWorkspace.tasks")}
          </button>
          <button
            type="button"
            className="arcChatTopNew"
            onClick={beginNew}
            aria-label={tr("arc.chat.agentChatWorkspace.newChat")}
          >
            <Icon name="plus" />
          </button>
        </div>
      </header>

      <div className="arcChatScroll" ref={scrollArea}>
        {!current ? (
          <div className="arcChatWelcome">
            <div className="arcChatStar" aria-hidden="true">
              <img src="/remote-arc.svg" alt="" />
            </div>
            <h1>{tr("arc.chat.agentChatWorkspace.letSGetToWork")}</h1>
            <p>{tr("arc.chat.agentChatWorkspace.yourAppsYourComputersYourNext")}</p>
            {composer}
            <div className="arcChatIdeas">
              {examples.map((example) => (
                <button
                  type="button"
                  className="arcChatIdea"
                  key={example.title}
                  onClick={() => {
                    setDraft(example.text);
                    editor.current?.focus();
                  }}
                >
                  <span className="arcChatIdeaIcon">
                    <Icon name={example.icon} />
                  </span>
                  <strong>{example.title}</strong>
                  <span>{example.detail}</span>
                  <span className="arcChatIdeaArrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="arcChatMessages"
            role="log"
            aria-label={tr("arc.chat.agentChatWorkspace.chatMessages")}
            aria-live="polite"
          >
            {current.messages.map((message) => (
              <div key={message.id} className={"arcChatMessage " + message.role}>
                {message.role === "assistant" && (
                  <span className="arcMessageAvatar">
                    <Icon name="spark" />
                  </span>
                )}
                <div className="arcMessageBody">
                  <span className="arcMessageText">{message.content}</span>
                </div>
              </div>
            ))}
            {current.criteria && (
              <div className="arcChatReviewPanel">
                <div className="arcChatReviewTop">
                  <Icon name="check" />
                  <strong>{tr("arc.chat.agentChatWorkspace.goalReadyForReview")}</strong>
                </div>
                <div className="arcChatReviewSummary">
                  <strong>{tr("arc.chat.agentChatWorkspace.objective")}</strong>
                  <p>{current.objective}</p>
                  <strong>{tr("arc.chat.agentChatWorkspace.successCriteria")}</strong>
                  <p>{current.criteria}</p>
                </div>
                <button
                  type="button"
                  className="arcChatReviewButton"
                  onClick={() => onPrepareGoal(current.objective, current.criteria)}
                >
                  {tr("arc.chat.agentChatWorkspace.reviewExecution")}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
                <p>{tr("arc.chat.agentChatWorkspace.devicePermissionsAndCostMustBe")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {current && composer}

      {mobileOpen && (
        <div
          className="arcChatMobileBackdrop"
          role="presentation"
          onClick={() => setMobileOpen(false)}
        >
          <div
            ref={drawer}
            className="arcChatMobileDrawer"
            role="dialog"
            aria-modal="true"
            aria-label={tr("arc.chat.agentChatWorkspace.chatHistory")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="arcMobileDrawerHeader">
              <strong>Arc Agent</strong>
              <button
                type="button"
                aria-label={tr("arc.chat.agentChatWorkspace.close")}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {sidebar(true)}
          </div>
        </div>
      )}
    </section>
  );
}
