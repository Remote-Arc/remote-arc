import type { Translate } from "../../../locales/locale-catalog.js";
import { RunnerAttentionList } from "../../browser-runner/runner-view.js";
import { ArcTaskCard } from "../workspace/arc-task-card.js";
import {
  useArcComposerInputs,
  ARC_MESSAGE_MAX_LENGTH,
} from "../../../hooks/arc/use-arc-composer-inputs.js";
import {
  ArcComposerMenu,
  ArcComposerAttachments,
  ComposerGlyph,
} from "../composer/arc-composer-menu.js";
import { ArcMessageAttachments } from "./arc-message-attachments.js";
import { ArcMessageReferences } from "./arc-message-references.js";
import { ArcEmployeeDraftCard } from "../teams/arc-employee-draft.js";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useArcChat } from "../../../hooks/arc/use-arc-chat.js";
import { ProductIcon as Icon, type ProductIconName } from "../../../components/product-icon.js";
import "../../../styles/arc/chat/agent-chat-workspace.css";
import { OverviewGreeting } from "../../../components/overview-greeting.js";
import { ArcHomeBrief } from "./arc-home-brief.js";
import { ArcModelPicker } from "./arc-model-picker.js";
import { arcTranscript } from "./arc-transcript.js";
import { useArcSkillMentions, type ArcMention } from "../../../hooks/arc/use-arc-skill-mentions.js";
import { ArcVerificationScope, ArcRunReceipt } from "./arc-verification-ui.js";
import { ArcTurnWork } from "./arc-turn-work.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import "../../../styles/arc/chat/arc-chat-surface.css";
import "../../../styles/arc/chat/arc-verification.css";
import { billingRecovery } from "../../../../../../packages/protocol/src/billing-recovery.js";
import { BillingRecoveryActions } from "../../billing/billing-recovery-actions.js";

type Props = {
  navigationOpen: boolean;
  onNavigationChange: (open: boolean) => void;
  activeTab: string;
  onOpenChat: () => void;
  tr: Translate;
  accountId: string;
  accountName?: string | null;
  onlineDevices: number;
  totalDevices?: number;
  initialPrompt?: string;
  initialReferences?: ArcMention[];
  initialSessionId?: string;
  onOpenGoals: () => void;
  onOpenRoutines: () => void;
  onOpenActivity: () => void;
  onOpenSettings: () => void;
  onManageApps: () => void;
  onManageDevices: () => void;
  onManageTeams?: () => void;
  onManageSkills?: () => void;
};
const plugins = [remarkGfm];
const formatCredits = (value: number) =>
  value >= 10 ? String(Math.floor(value)) : value.toFixed(1).replace(/\.0$/, "");
export function ArcNativeChat({
  navigationOpen,
  onNavigationChange,
  activeTab,
  onOpenChat,
  tr,
  accountId,
  accountName,
  onlineDevices,
  totalDevices = onlineDevices,
  initialPrompt,
  initialReferences,
  initialSessionId,
  onOpenGoals,
  onOpenRoutines,
  onOpenActivity,
  onOpenSettings,
  onManageApps,
  onManageDevices,
  onManageSkills,
  onManageTeams,
}: Props) {
  const atmosphereId = useId();
  const chat = useArcChat(accountId, initialSessionId),
    [draft, setDraft] = useState(initialPrompt || ""),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [sidebarMount, setSidebarMount] = useState<Element | null>(null);
  const mobileOpen = navigationOpen,
    setMobileOpen = onNavigationChange;
  const editor = useRef<HTMLTextAreaElement>(null),
    scrollArea = useRef<HTMLDivElement>(null),
    drawer = useRef<HTMLDivElement>(null);
  const historyScroll = useRef<{ top: number; height: number } | null>(null),
    followLatest = useRef(true);
  const draftRevision = useRef(0);
  useLayoutEffect(() => {
    draftRevision.current++;
  }, [draft]);
  const inputs = useArcComposerInputs(accountId, setDraft, tr, draft);
  const [dragging, setDragging] = useState(false);
  const resourceRevision = JSON.stringify([
    chat.current?.employeeDrafts?.map((item) => [item.employeeId, item.status]),
    chat.current?.appConnections?.map((item) => [item.id, item.status]),
  ]);
  const mentions = useArcSkillMentions(
    accountId,
    draft,
    setDraft,
    editor,
    tr,
    initialReferences,
    resourceRevision,
  );

  useEffect(() => {
    if (activeTab !== "agent-chat" || !chat.current) return;
    const url = new URL(location.href);
    url.searchParams.set("session", chat.current.session.id);
    history.replaceState(history.state, "", url);
  }, [activeTab, chat.current?.session.id]);
  useEffect(() => setSidebarMount(document.getElementById("arc-sidebar-nav-root")), []);
  useEffect(() => {
    if (initialSessionId) void chat.open(initialSessionId);
  }, [initialSessionId, chat.open]);
  useLayoutEffect(() => {
    const area = scrollArea.current,
      anchor = historyScroll.current;
    if (area && anchor && !chat.loadingHistory) {
      area.scrollTop = anchor.top + area.scrollHeight - anchor.height;
      historyScroll.current = null;
    }
  }, [chat.loadingHistory, chat.current?.messages.length]);
  useEffect(() => {
    followLatest.current = true;
  }, [chat.current?.session.id]);
  useEffect(() => {
    const area = scrollArea.current;
    if (area && !historyScroll.current && followLatest.current)
      area.scrollTo({ top: chat.current ? area.scrollHeight : 0, behavior: "instant" });
  }, [chat.current?.session.id, chat.current?.messages.length, chat.run?.status]);
  const loadEarlier = async () => {
    followLatest.current = false;
    const area = scrollArea.current;
    if (area) historyScroll.current = { top: area.scrollTop, height: area.scrollHeight };
    if (!(await chat.loadEarlier())) historyScroll.current = null;
  };
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () =>
      Array.from(
        drawer.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input,a[href]") || [],
      ).filter((e) => e.getClientRects().length);
    items()[0]?.focus();
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
      }
      if (e.key === "Tab") {
        const all = items(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [mobileOpen]);
  const beginNew = () => {
    onOpenChat();
    const url = new URL(location.href);
    url.searchParams.delete("session");
    history.replaceState(history.state, "", url);
    chat.newChat();
    mentions.clear();
    inputs.clear();
    setDraft("");
    setMobileOpen(false);
    requestAnimationFrame(() => editor.current?.focus());
  };
  const navigate = (fn: () => void) => {
    setMobileOpen(false);
    fn();
  };
  const examples: { icon: ProductIconName; title: string; detail: string; text: string }[] = [
    {
      icon: "tasks",
      title: tr("arc.chat.arcNativeChat.moveAProjectForward"),
      detail: tr("arc.chat.arcNativeChat.codeTestsAClearResult"),
      text: tr("arc.chat.arcNativeChat.inspectMyProjectIdentifyAUseful"),
    },
    {
      icon: "routine",
      title: tr("arc.chat.arcNativeChat.startAMorningRoutine"),
      detail: tr("arc.chat.arcNativeChat.aDailyHeadStart"),
      text: tr("arc.chat.arcNativeChat.everyMorningAtSummarizeMyEmail"),
    },
    {
      icon: "apps",
      title: tr("arc.chat.arcNativeChat.bringMyAppsTogether"),
      detail: tr("arc.chat.arcNativeChat.githubSlackMore"),
      text: tr("arc.chat.arcNativeChat.lookAtMyConnectedAppsAnd"),
    },
    {
      icon: "users",
      title: tr("arc.chat.arcNativeChat.bringATeamToTheGoal"),
      detail: tr("arc.chat.arcNativeChat.oneGoalCoordinatedWork"),
      text: tr("arc.chat.arcNativeChat.createADeveloperDesignerBusinessAgent"),
    },
  ];
  const filtered = chat.sessions.filter((s) =>
    s.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const sidebar = (mobile: boolean) => (
    <nav
      className={"arcChatNavigation" + (mobile ? " arcChatNavigationMobile" : "")}
      aria-label={tr("arc.chat.arcNativeChat.arcNavigation")}
    >
      <div className="arcSidebarSectionTitle">{tr("arc.chat.arcNativeChat.workspace")}</div>
      <button
        type="button"
        className="arcSidebarPrimary"
        aria-label={tr("arc.chat.arcNativeChat.newChat")}
        title={tr("arc.chat.arcNativeChat.newChat")}
        onClick={beginNew}
      >
        <Icon name="add" />
        <span>{tr("arc.chat.arcNativeChat.newChat")}</span>
      </button>
      <button
        type="button"
        className="arcSidebarAction"
        aria-label={tr("arc.chat.arcNativeChat.tasks")}
        title={tr("arc.chat.arcNativeChat.tasks")}
        aria-current={activeTab === "agent-goals" ? "page" : undefined}
        onClick={() => navigate(onOpenGoals)}
      >
        <Icon name="tasks" />
        <span>{tr("arc.chat.arcNativeChat.tasks")}</span>
      </button>

      <button
        type="button"
        className="arcSidebarAction"
        aria-label={tr("arc.chat.arcNativeChat.activity")}
        title={tr("arc.chat.arcNativeChat.activity")}
        aria-current={activeTab === "agent-activity" ? "page" : undefined}
        onClick={() => navigate(onOpenActivity)}
      >
        <Icon name="activity" />
        <span>{tr("arc.chat.arcNativeChat.activity")}</span>
      </button>
      <button
        type="button"
        className="arcSidebarAction"
        aria-current={activeTab === "agent-teams" ? "page" : undefined}
        onClick={() => navigate(onManageTeams || onOpenSettings)}
      >
        <Icon name="users" />
        <span>{tr("arc.chat.arcNativeChat.agents")}</span>
      </button>
      <div className="arcSidebarSectionTitle">{tr("arc.chat.arcNativeChat.tools")}</div>
      <button
        type="button"
        className="arcSidebarAction"
        aria-label={tr("arc.chat.arcNativeChat.apps")}
        title={tr("arc.chat.arcNativeChat.apps")}
        aria-current={activeTab === "agent-apps" ? "page" : undefined}
        onClick={() => navigate(onManageApps)}
      >
        <Icon name="apps" />
        <span>{tr("arc.chat.arcNativeChat.apps")}</span>
      </button>
      <button
        type="button"
        className="arcSidebarAction"
        aria-label={tr("arc.chat.arcNativeChat.devices")}
        title={tr("arc.chat.arcNativeChat.devices")}
        aria-current={activeTab === "agent-devices" ? "page" : undefined}
        onClick={() => navigate(onManageDevices)}
      >
        <Icon name="device" />
        <span>{tr("arc.chat.arcNativeChat.devices")}</span>
      </button>
      {onManageSkills && (
        <button
          type="button"
          className="arcSidebarAction"
          aria-label={tr("arc.chat.arcNativeChat.skills")}
          title={tr("arc.chat.arcNativeChat.skills")}
          aria-current={activeTab === "agent-skills" ? "page" : undefined}
          onClick={() => navigate(onManageSkills)}
        >
          <Icon name="spark" />
          <span>{tr("arc.chat.arcNativeChat.skills")}</span>
        </button>
      )}
      <div className="arcSidebarHistoryHeading">
        <span className="arcSidebarSectionTitle">{tr("arc.chat.arcNativeChat.recentChats")}</span>
        <button
          type="button"
          aria-label={tr("arc.chat.arcNativeChat.searchChatHistory")}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen(!searchOpen)}
        >
          <Icon name="search" size={14} />
        </button>
      </div>
      {searchOpen && (
        <label className="arcSidebarSearch">
          <Icon name="search" size={14} />
          <span className="arcSrOnly">{tr("arc.chat.arcNativeChat.searchYourChats")}</span>
          <input
            autoFocus
            type="search"
            placeholder={tr("arc.chat.arcNativeChat.findAConversation")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <div className="arcSessionList">
        {filtered.length ? (
          filtered.map((s) => (
            <div
              className={
                "arcSessionRow" +
                (activeTab === "agent-chat" && chat.current?.session.id === s.id ? " selected" : "")
              }
              key={s.id}
            >
              <button
                type="button"
                className="arcSessionOpen"
                title={s.title}
                aria-current={
                  activeTab === "agent-chat" && chat.current?.session.id === s.id
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  onOpenChat();
                  mentions.clear();
                  void chat.open(s.id);
                  setMobileOpen(false);
                }}
              >
                <Icon name={s.automationId ? "routine" : "chat"} />
                <span className="arcSessionTitle">{s.title}</span>
                {s.automationId && (
                  <small className="arcSessionTaskBadge">{tr("arc.chat.arcNativeChat.task")}</small>
                )}
              </button>
              {!s.automationId && (
                <button
                  type="button"
                  className="arcSessionDelete"
                  aria-label={tr("arc.chat.arcNativeChat.deleteChat") + ": " + s.title}
                  onClick={() => void chat.remove(s.id)}
                >
                  <Icon name="trash" />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="arcSidebarEmpty">
            {search
              ? tr("arc.chat.arcNativeChat.noMatchingChats")
              : tr("arc.chat.arcNativeChat.yourConversationsWillAppearHere")}
          </div>
        )}
      </div>
      {mobile && (
        <button type="button" className="arcSidebarAction" onClick={() => navigate(onOpenSettings)}>
          <Icon name="settings" />
          <span>{tr("arc.chat.arcNativeChat.settings")}</span>
        </button>
      )}
    </nav>
  );
  const errorText = (code: string) => {
    // Show the daily reset in the reader's own time zone, not as UTC.
    if (code === "ARC_DAILY_LIMIT_REACHED") {
      const now = new Date();
      return tr("arc.chat.arcNativeChat.todaysArcAllowanceIsUsedUp", {
        time: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
        ).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      });
    }
    const recovery = billingRecovery(code);
    if (recovery) return tr(...recovery.message);
    if (code === "ARC_DEVICE_REQUIREMENTS_UNMET")
      return tr("arc.chat.arcNativeChat.noConnectedComputerMeetsThisRequest");
    if (code === "ARC_VERIFICATION_PENDING")
      return tr("arc.chat.arcNativeChat.theSelectedResultCouldNotBe");
    if (code === "ARC_VERIFICATION_FAILED")
      return tr("arc.chat.arcNativeChat.aRequiredCheckDidNotPass");
    if (code === "ARC_VERIFICATION_CONNECTION_REQUIRED")
      return tr("arc.chat.arcNativeChat.chooseAnActiveAccountForThis");
    if (code === "MODEL_ALREADY_DISPATCHED")
      return tr("arc.chat.arcNativeChat.thisRequestStoppedBeforeANew");
    if (/ARC_FUNDING/.test(code)) return tr("arc.chat.arcNativeChat.arcSSharedModelAllowanceIs");
    if (code === "ARC_PLAN_EXCLUDES_HOSTED")
      return tr("arc.chat.arcNativeChat.yourArcTrialHasEndedConnect");
    if (/ARC_TRIAL_EXPIRED/.test(code))
      return tr("arc.chat.arcNativeChat.yourTrialHasEndedYourConversations");
    if (/ARC_TRIAL_REQUIRED/.test(code))
      return tr("arc.chat.arcNativeChat.activateYourTrialToWorkWith");
    if (/PAID_MODEL/.test(code)) return tr("arc.chat.arcNativeChat.thisModelNeedsAPaidModel");
    if (/NOT_CONFIGURED|MODEL_AUTH|CHAT_UNAVAILABLE/.test(code))
      return tr("arc.chat.arcNativeChat.arcIsNotReadyInThis");
    if (code === "MODEL_INCOMPLETE_RESPONSE")
      return tr("arc.chat.arcNativeChat.theModelDidNotReturnA");
    if (code === "ARC_TOKEN_LIMIT")
      return tr("arc.chat.arcNativeChat.thisRunUsedItsTokenAllowance");
    if (code === "ARC_CREDITS_EXHAUSTED" || code === "BILLING_CREDITS_EXHAUSTED")
      return tr("arc.chat.arcNativeChat.yourAvailableCreditsHaveBeenUsed");
    if (/BUDGET|QUOTA/.test(code)) return tr("arc.chat.arcNativeChat.aUsageBudgetOrProviderLimit");
    if (/TIME_LIMIT|STEP_LIMIT/.test(code))
      return tr("arc.chat.arcNativeChat.thisRunReachedItsWorkLimit");
    if (/INTERRUPTED|UNKNOWN/.test(code))
      return tr("arc.chat.arcNativeChat.theLastActionCouldNotBe");
    if (/BUSY/.test(code)) return tr("arc.chat.arcNativeChat.aRunIsAlreadyWorkingIn");
    return tr("arc.chat.arcNativeChat.arcCouldNotCompleteThisRequest");
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value =
      draft.trim() ||
      (inputs.attachmentIds.length
        ? tr("arc.chat.arcNativeChat.pleaseReviewTheAttachedFiles")
        : inputs.location
          ? tr("arc.chat.arcNativeChat.pleaseUseTheAttachedPlaceFor")
          : "");
    const revision = draftRevision.current,
      references = mentions.selected,
      attachmentIds = inputs.attachmentIds,
      place = inputs.location;
    if (
      value &&
      !inputs.blocked &&
      (await chat.send(
        value,
        references.filter((item) => item.kind === "skill").map((item) => item.id),
        undefined,
        references.filter((item) => item.kind === "app").map((item) => item.id),
        references.filter((item) => item.kind === "employee").map((item) => item.id),
        { attachmentIds, ...(place ? { location: place } : {}) },
      ))
    ) {
      if (draftRevision.current === revision) setDraft("");
      mentions.consume(references);
      inputs.consume(attachmentIds, place);
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!chat.busy && !chat.running) event.currentTarget.form?.requestSubmit();
    }
  };
  const composer = (
    <div className="arcChatBottom">
      <form
        className={
          "arcChatComposer" + (chat.running ? " isWorking" : "") + (dragging ? " isDragging" : "")
        }
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={(e) => {
          if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget))
            setDragging(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            setDragging(false);
            inputs.addFiles(e.dataTransfer.files);
          }
        }}
        onSubmit={(event) => {
          followLatest.current = true;
          void submit(event);
        }}
      >
        <label className="arcSrOnly" htmlFor="arc-chat-input">
          {tr("arc.chat.arcNativeChat.messageArc")}
        </label>
        {mentions.menu}
        <ArcComposerAttachments inputs={inputs} tr={tr} />
        {mentions.chips}
        <textarea
          ref={editor}
          id="arc-chat-input"
          rows={2}
          maxLength={ARC_MESSAGE_MAX_LENGTH}
          value={draft}
          placeholder={tr("arc.chat.arcNativeChat.tellArcWhatYouWantTo")}
          onChange={(e) => mentions.onChange(e.target.value, e.target.selectionStart)}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              inputs.addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={onKeyDown}
          {...mentions.inputProps}
        />
        <div className="arcChatComposerBottom">
          <div className="arcChatTools">
            <ArcComposerMenu
              inputs={inputs}
              editor={editor}
              tr={tr}
              disabled={chat.running || chat.busy}
              onReferences={(kind) => mentions.openFor(kind)}
            />
            <ArcModelPicker
              models={chat.service?.models || []}
              value={chat.modelId}
              disabled={chat.running || chat.busy}
              onChange={chat.setModelId}
              tr={tr}
            />
            <button
              type="button"
              onClick={onManageDevices}
              title={tr("arc.chat.arcNativeChat.manageComputers")}
            >
              <Icon name="device" size={14} />
              {onlineDevices}{" "}
              {onlineDevices === 1
                ? tr("arc.chat.arcNativeChat.device")
                : tr("arc.chat.arcNativeChat.devices2")}
            </button>
          </div>
          <div className="arcComposerActions">
            <button
              type="button"
              className="arcVoiceButton"
              disabled={chat.running || chat.busy || !inputs.voiceSupported}
              data-listening={inputs.listening}
              onClick={inputs.toggleVoice}
              aria-label={
                inputs.listening
                  ? tr("arc.chat.arcNativeChat.stopVoiceInput")
                  : tr("arc.chat.arcNativeChat.voiceInput")
              }
              title={
                inputs.voiceSupported
                  ? tr("arc.chat.arcNativeChat.voiceInput")
                  : tr("arc.chat.arcNativeChat.voiceInputIsNotSupportedBy")
              }
            >
              <ComposerGlyph name="mic" />
            </button>
            {chat.running ? (
              <button
                type="button"
                className="arcChatSend arcChatStop"
                onClick={() => void chat.cancel()}
                aria-label={tr("arc.chat.arcNativeChat.stopRun")}
              >
                <Icon name="stop" />
              </button>
            ) : (
              <button
                type="submit"
                className="arcChatSend"
                disabled={
                  (!draft.trim() && !inputs.attachmentIds.length && !inputs.location) ||
                  inputs.blocked ||
                  chat.busy ||
                  !chat.service?.enabled ||
                  !chat.service.access.canUse
                }
                aria-label={tr("arc.chat.arcNativeChat.sendMessage")}
              >
                <Icon name="arrowUp" />
              </button>
            )}
          </div>
        </div>
      </form>
      <p className="arcChatDisclaimer">
        {chat.service?.access.status === "eligible"
          ? tr("arc.chat.arcNativeChat.startYourFreeTrialAboveTo")
          : chat.service?.preview
            ? tr("arc.chat.arcNativeChat.interactivePreviewSimulatedRepliesNoReal")
            : tr("arc.chat.arcNativeChat.arcCarriesOutYourRequestAnd")}
      </p>
    </div>
  );
  const access = chat.service?.access;
  const trial = access && (
    <div className="arcTrialStatus" data-state={access.status}>
      <div>
        <Icon name={access.status === "active" ? "spark" : "shield"} size={17} />
        <span>
          <strong>
            {access.status === "eligible"
              ? access.trialDays
                ? tr("arc.chat.arcNativeChat.yourNextDaysWithArc", { trialDays: access.trialDays })
                : tr("arc.chat.arcNativeChat.yourWorkWithArc")
              : access.status === "active"
                ? tr("arc.chat.arcNativeChat.daysLeftInYourTrial", {
                    daysRemaining: access.daysRemaining,
                  })
                : access.status === "paid"
                  ? tr("arc.chat.arcNativeChat.arcWorkspaceIsActive")
                  : access.status === "excluded"
                    ? tr("arc.chat.arcNativeChat.yourArcTrialHasEnded")
                    : tr("arc.chat.arcNativeChat.yourTrialHasEnded")}
          </strong>
          {access.status === "excluded" && (
            <small>{tr("arc.chat.arcNativeChat.connectUnlimitedKeepsRunningYourOwn")}</small>
          )}
          {access.status === "eligible" && (
            <small>{tr("arc.chat.arcNativeChat.noCardNoModelApiKey")}</small>
          )}
          {access.status === "expired" && (
            <small>
              {tr("arc.chat.arcNativeChat.yourRemainingCreditsConversationsResultsAnd")}
            </small>
          )}
        </span>
      </div>
      {access.status === "eligible" ? (
        <button
          className="arcRadiantCta"
          type="button"
          disabled={!chat.service?.enabled || chat.busy}
          onClick={() => void chat.startTrial()}
        >
          {tr("arc.chat.arcNativeChat.startFreeTrial")}
          <Icon name="arrowUpRight" size={14} />
        </button>
      ) : access.status === "active" && access.daysRemaining <= 3 ? (
        <a href="/checkout">
          {tr("arc.chat.arcNativeChat.keepWorkingWithArc")}
          <Icon name="arrowUpRight" size={14} />
        </a>
      ) : access.creditsAvailable != null &&
        access.creditsAvailable < Math.max(5, (access.trialCredits || 0) / 10) ? (
        <a href="/checkout">
          {tr("arc.chat.arcNativeChat.creditsLeft", {
            creditsAvailable: formatCredits(access.creditsAvailable),
          })}
          <Icon name="arrowUpRight" size={14} />
        </a>
      ) : access.canUse ? (
        <span>
          {access.creditsAvailable != null ? (
            tr("arc.chat.arcNativeChat.creditsLeftToday", {
              creditsAvailable: formatCredits(access.creditsAvailable),
              dailyUsedPercent: access.dailyUsedPercent,
            })
          ) : (
            <>
              {tr("arc.chat.arcNativeChat.dailyUsage")} · {access.dailyUsedPercent}%
            </>
          )}
        </span>
      ) : (
        <a href="/checkout">
          {tr("arc.chat.arcNativeChat.viewPlans")}
          <Icon name="arrowUpRight" size={14} />
        </a>
      )}
    </div>
  );

  const failure = chat.error || chat.run?.error || "",
    failureCode = /^[A-Z_]{1,100}$/.test(failure) ? failure : "CHAT_UNAVAILABLE";
  const transcript = arcTranscript(chat.current?.messages || []);
  const beforeWork = new Map<string, NonNullable<typeof chat.run>>(),
    afterWork = new Map<string, NonNullable<typeof chat.run>>();
  const receiptAt = new Map<string, NonNullable<NonNullable<typeof chat.run>["receipt"]>>();
  for (const run of chat.current?.runs || []) {
    const messages = transcript
        .map((entry) => entry.message)
        .filter((message) => message.run_id === run.id),
      answers = messages.filter((message) => message.role === "assistant"),
      first = answers[0],
      last = answers.at(-1),
      user = messages.find((message) => message.role === "user");
    if (first) beforeWork.set(first.id, run);
    else if (user) afterWork.set(user.id, run);
    if (last && run.receipt?.scope) receiptAt.set(last.id, run.receipt);
  }
  const loadingConversation = !chat.current && Boolean(chat.selectedSessionId);
  const work = (run: NonNullable<typeof chat.run>) => (
    <ArcTurnWork
      run={run}
      messages={chat.current?.messages.filter((message) => message.run_id === run.id) || []}
      tr={tr}
      errorText={errorText}
      delegations={chat.current?.delegations?.filter((item) => item.sourceRunId === run.id)}
      connectionRequests={chat.current?.appConnections?.filter(
        (request) => request.sourceRunId === run.id,
      )}
      onConnectionChanged={chat.refreshCurrent}
    />
  );
  const failureNotice = failure && (
    <div className={"arcChatError" + (chat.current ? " arcChatErrorInline" : "")} role="alert">
      <p>
        {errorText(failure)}
        {/PAID_MODEL/.test(failure) && (
          <a href="/checkout">
            {tr("arc.chat.arcNativeChat.viewPlans")} <Icon name="arrowUpRight" size={13} />
          </a>
        )}
      </p>
      <BillingRecoveryActions code={failure} tr={tr} />
      <details className="arcChatErrorDetails">
        <summary>{tr("arc.chat.arcNativeChat.errorDetails")}</summary>
        <code>{failureCode}</code>
        {chat.run?.id && (
          <small>
            {tr("arc.chat.arcNativeChat.run")} · {chat.run.id}
          </small>
        )}
      </details>
    </div>
  );
  return (
    <section
      className="arcChatShell"
      data-state={chat.current ? "conversation" : loadingConversation ? "loading" : "welcome"}
      aria-label={tr("arc.chat.arcNativeChat.arcChat")}
    >
      {sidebarMount && createPortal(sidebar(false), sidebarMount)}
      <div className="arcChatAtmosphere" aria-hidden="true">
        <div className="arcChatAurora" />
        <svg
          className="arcChatOrbits"
          viewBox="0 0 1800 1100"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
        >
          <defs>
            <linearGradient
              id={atmosphereId}
              x1="180"
              y1="0"
              x2="1580"
              y2="900"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#7dd3fc" stopOpacity="0" />
              <stop offset=".42" stopColor="#7dd3fc" stopOpacity=".52" />
              <stop offset=".75" stopColor="#bae6fd" stopOpacity=".12" />
              <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke={"url(#" + atmosphereId + ")"}>
            <path d="M-320 640C60 20 560-110 1090 65S1680 570 2110 540" />
            <path d="M-350 675C35-10 560-150 1110 30S1730 600 2160 565" />
            <path d="M-380 710C10-40 560-190 1130-5S1780 630 2210 590" />
            <path d="M-440 780C-40-100 560-270 1170-75S1880 690 2310 640" />
          </g>
        </svg>
        <div className="arcChatHorizon" />
      </div>
      <header className="arcChatTopbar">
        <div className="arcChatTopLeft">
          <button
            type="button"
            className="arcChatMobileMenu"
            aria-label={tr("arc.chat.arcNativeChat.openChatHistory")}
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="arcChatBrand">Arc</span>
          <span className="arcChatBeta">{tr("arc.chat.arcNativeChat.personalAgent")}</span>
        </div>
        <div className="arcChatTopRight">
          <button type="button" className="arcChatTopLink" onClick={onOpenGoals}>
            <Icon name="tasks" />
            {tr("arc.chat.arcNativeChat.tasks")}
          </button>
          <button
            type="button"
            className="arcChatTopNew"
            onClick={beginNew}
            aria-label={tr("arc.chat.arcNativeChat.newChat")}
          >
            <Icon name="add" />
          </button>
        </div>
      </header>
      {Boolean(chat.current?.work?.length) && (
        <div className="arcChatTaskBar">
          <Icon name="routine" size={16} />
          <span>
            {chat.current?.work?.find((task) => task.conversationId === chat.current?.session.id)
              ?.name || tr("arc.chat.arcNativeChat.tasksLinkedToThisConversation")}
          </span>
          <button
            type="button"
            onClick={() => scrollArea.current?.scrollTo({ top: 0, behavior: "instant" })}
          >
            {tr("arc.chat.arcNativeChat.viewTasks")} · {chat.current?.work?.length}
          </button>
        </div>
      )}
      <div
        className="arcChatScroll"
        ref={scrollArea}
        onScroll={(event) => {
          const area = event.currentTarget;
          followLatest.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        }}
      >
        {chat.current && (
          <RunnerAttentionList
            key={chat.current.session.id}
            arcSessionId={chat.current.session.id}
          />
        )}
        {loadingConversation ? (
          <div className="arcConversationLoading" aria-busy={chat.opening}>
            {chat.opening || !chat.error ? (
              <WorkspaceLoading
                label={tr("arc.chat.arcNativeChat.openingConversation")}
                variant="rows"
              />
            ) : (
              <>
                <p>{tr("arc.chat.arcNativeChat.couldNotLoadThisConversation")}</p>
                <button
                  type="button"
                  onClick={() => void chat.open(chat.selectedSessionId || initialSessionId!)}
                >
                  {tr("arc.chat.arcNativeChat.tryAgain")}
                </button>
              </>
            )}
          </div>
        ) : !chat.current ? (
          <div className="arcChatWelcome">
            <div className="arcChatStar" aria-hidden="true">
              <img src="/remote-arc.svg" alt="" />
            </div>
            <span className="arcChatWelcomeEyebrow">
              {tr("arc.chat.arcNativeChat.aLittleLessBusywork")}
            </span>
            <OverviewGreeting name={accountName || null} tr={tr} />
            <p>{tr("arc.chat.arcNativeChat.tellArcYourGoalItOrganizes")}</p>
            {access?.status === "eligible" && trial}
            {composer}
            <ArcHomeBrief
              enabled={showBrief(chat.service)}
              onlineDevices={onlineDevices}
              totalDevices={totalDevices}
              tr={tr}
              onTasks={onOpenGoals}
              onRoutines={onOpenRoutines}
              onDevices={onManageDevices}
              onReview={(prompt, sessionId) => {
                setDraft(prompt);
                if (sessionId)
                  void chat
                    .open(sessionId)
                    .then(() => requestAnimationFrame(() => editor.current?.focus()));
                else editor.current?.focus();
              }}
            />
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
                  <span className="arcChatIdeaArrow">
                    <Icon name="arrowUpRight" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className="arcChatMessages"
            role="log"
            aria-label={tr("arc.chat.arcNativeChat.chatMessages")}
          >
            {Boolean(chat.current?.work?.length) && (
              <section
                className="arcChatTaskCards"
                aria-label={tr("arc.chat.arcNativeChat.tasksInThisConversation")}
              >
                <h2>{tr("arc.chat.arcNativeChat.tasksInThisConversation2")}</h2>
                {chat.current?.work?.map((task) => (
                  <ArcTaskCard
                    key={task.id}
                    work={task}
                    tr={tr}
                    currentSessionId={chat.current?.session.id}
                    onOpen={(id) => void chat.open(id)}
                    onManage={(prompt, id) => {
                      setDraft(prompt);
                      if (id && id !== chat.current?.session.id) void chat.open(id);
                      requestAnimationFrame(() => editor.current?.focus());
                    }}
                  />
                ))}
              </section>
            )}
            {chat.current?.hasMore && (
              <button
                className="arcLoadHistory"
                type="button"
                disabled={chat.loadingHistory}
                onClick={() => void loadEarlier()}
              >
                {chat.loadingHistory
                  ? tr("arc.chat.arcNativeChat.loadingEarlierMessages")
                  : tr("arc.chat.arcNativeChat.loadEarlierMessages")}
              </button>
            )}
            {transcript.map((entry) => {
              if (entry.kind !== "message") return null;
              const message = entry.message;
              return (
                <Fragment key={message.id}>
                  {beforeWork.has(message.id) && work(beforeWork.get(message.id)!)}
                  <div className={"arcChatMessage " + message.role}>
                    {message.role === "assistant" && (
                      <span className="arcMessageAvatar">
                        <img src="/remote-arc.svg" alt="Arc" width={21} height={21} />
                      </span>
                    )}
                    <div className="arcMessageBody">
                      <ArcMessageAttachments
                        attachments={message.attachments}
                        location={message.location}
                        tr={tr}
                      />
                      <ArcMessageReferences message={message} tr={tr} />
                      {message.role === "user" ? (
                        <span className="arcMessageText">{message.text}</span>
                      ) : (
                        <div className="arcMessageMarkdown">
                          <Markdown
                            remarkPlugins={plugins}
                            skipHtml
                            components={{
                              a: ({ href, children }) => (
                                <a href={href} target="_blank" rel="noopener noreferrer">
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {message.text}
                          </Markdown>
                        </div>
                      )}
                      {message.verification && (
                        <ArcVerificationScope scope={message.verification} tr={tr} />
                      )}
                      {receiptAt.has(message.id) && (
                        <ArcRunReceipt receipt={receiptAt.get(message.id)!} tr={tr} />
                      )}
                    </div>
                  </div>
                  {afterWork.has(message.id) && work(afterWork.get(message.id)!)}
                  {chat.current?.employeeDrafts
                    ?.filter(
                      (draft) =>
                        draft.sourceRunId === message.run_id &&
                        transcript
                          .filter((item) => item.message.run_id === draft.sourceRunId)
                          .at(-1)?.message.id === message.id,
                    )
                    .map((draft) => (
                      <ArcEmployeeDraftCard key={draft.id} draft={draft} tr={tr} />
                    ))}
                </Fragment>
              );
            })}
            {chat.error && failureNotice}
          </div>
        )}
      </div>
      {!chat.current && failureNotice}
      {chat.service && !chat.service.enabled && !chat.service.preview && !chat.error && (
        <div className="arcChatServiceNotice" role="status">
          {tr("arc.chat.arcNativeChat.arcIsBeingSetUpFor")}
        </div>
      )}
      {(chat.current || access?.status !== "eligible") && trial}
      {chat.current && composer}
      {mobileOpen &&
        createPortal(
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
              aria-label={tr("arc.chat.arcNativeChat.chatHistory")}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="arcMobileDrawerHeader">
                <strong>Arc</strong>
                <button
                  type="button"
                  aria-label={tr("arc.chat.arcNativeChat.close")}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              {sidebar(true)}
            </div>
          </div>,
          document.querySelector(".appFrame") || document.body,
        )}
    </section>
  );
}
const showBrief = (service: { enabled: boolean; preview?: boolean } | null) =>
  Boolean(service?.enabled || service?.preview);
