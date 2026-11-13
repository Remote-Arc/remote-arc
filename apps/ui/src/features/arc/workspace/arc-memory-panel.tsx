import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/arc/workspace/arc-memory-panel.css";

type Memory = {
  id: string;
  kind: "fact" | "work";
  category: string;
  content: string;
  source_session_id: string | null;
  updated_at: string;
};
type Data = {
  enabled: boolean;
  bytes: number;
  limits: { facts: number; work: number; factBytes: number };
  memories: Memory[];
};
export function ArcMemoryPanel() {
  const { tr } = useI18n(),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [content, setContent] = useState(""),
    [category, setCategory] = useState("preference"),
    [editing, setEditing] = useState<string | null>(null),
    [kind, setKind] = useState<"fact" | "work">("fact"),
    [query, setQuery] = useState(""),
    [clear, setClear] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await arcRequest<Data>("memory", undefined, signal);
    setData(result);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError(tr("arc.workspace.arcMemoryPanel.couldNotLoadMemoryPleaseRetry"));
    });
    return () => controller.abort();
  }, [load, tr]);
  async function action(path: string, method: string, body?: unknown) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await arcRequest(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      await load();
      return true;
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "ARC_MEMORY_DUPLICATE"
          ? tr("arc.workspace.arcMemoryPanel.thisNoteIsAlreadySaved")
          : code === "ARC_MEMORY_DISABLED"
            ? tr("arc.workspace.arcMemoryPanel.enableMemoryBeforeAddingANote")
            : tr("arc.workspace.arcMemoryPanel.couldNotSaveTheChangeUse"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      await action("memory" + (editing ? "/" + encodeURIComponent(editing) : ""), "POST", {
        content,
        category,
      })
    ) {
      setContent("");
      setEditing(null);
    }
  }
  const label = (value: string) =>
    value === "preference"
      ? tr("arc.workspace.arcMemoryPanel.preference")
      : value === "project"
        ? tr("arc.workspace.arcMemoryPanel.project")
        : value === "work"
          ? tr("arc.workspace.arcMemoryPanel.recentWork")
          : tr("arc.workspace.arcMemoryPanel.context");
  if (!data)
    return error ? (
      <section className="raSettingsSurface">
        <p role="alert">{error}</p>
        <button
          className="raSettingsButton"
          onClick={() =>
            void load()
              .then(() => setError(""))
              .catch(() => {})
          }
        >
          {tr("arc.workspace.arcMemoryPanel.retry")}
        </button>
      </section>
    ) : (
      <WorkspaceLoading label={tr("arc.workspace.arcMemoryPanel.loadingMemory")} />
    );
  const memories = data.memories.filter(
    (m) => m.kind === kind && m.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="raSettingsSections arcMemoryPanel">
      <section className="raSettingsSurface arcMemorySwitch">
        <div>
          <h3>{tr("arc.workspace.arcMemoryPanel.continuityAcrossConversations")}</h3>
          <p>{tr("arc.workspace.arcMemoryPanel.arcCanReuseSavedPreferencesProject")}</p>
        </div>
        <button
          type="button"
          className="raSettingsButton"
          role="switch"
          aria-checked={data.enabled}
          aria-label={tr("arc.workspace.arcMemoryPanel.personalMemory")}
          disabled={busy}
          onClick={() => void action("memory/settings", "POST", { enabled: !data.enabled })}
        >
          {data.enabled
            ? tr("arc.workspace.arcMemoryPanel.on")
            : tr("arc.workspace.arcMemoryPanel.off")}
        </button>
      </section>
      <section className="raSettingsSurface">
        <h3>{tr("arc.workspace.arcMemoryPanel.whatArcKeeps")}</h3>
        <p>{tr("arc.workspace.arcMemoryPanel.usefulNotesAndCompactConversationRecaps")}</p>
        <p className="raSettingsPlanCaption">
          {tr("arc.workspace.arcMemoryPanel.personalNotesRecentRecapsKbOf", {
            length: data.memories.filter((m) => m.kind === "fact").length,
            facts: data.limits.facts,
            length2: data.memories.filter((m) => m.kind === "work").length,
            work: data.limits.work,
            toFixed: (data.bytes / 1024).toFixed(1),
          })}
        </p>
      </section>
      <form className="raSettingsSurface arcMemoryForm" onSubmit={submit}>
        <h3>
          {editing
            ? tr("arc.workspace.arcMemoryPanel.editAMemory")
            : tr("arc.workspace.arcMemoryPanel.somethingWorthRemembering")}
        </h3>
        <label htmlFor="arc-memory-content">
          {tr("arc.workspace.arcMemoryPanel.aPreferenceOrUsefulProjectFact")}
        </label>
        <textarea
          id="arc-memory-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={600}
          required
          placeholder={tr("arc.workspace.arcMemoryPanel.forExampleIPreferConciseReplies")}
        />
        <p className="raSettingsPlanCaption">
          {tr("arc.workspace.arcMemoryPanel.keepNotesBriefDoNotSave")}
        </p>
        <div>
          <label htmlFor="arc-memory-category" className="srOnly">
            {tr("arc.workspace.arcMemoryPanel.category")}
          </label>
          <select
            id="arc-memory-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {["preference", "project", "context"].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          {editing && (
            <button
              type="button"
              className="raSettingsButton"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setContent("");
              }}
            >
              {tr("arc.workspace.arcMemoryPanel.cancel")}
            </button>
          )}
          <button
            type="submit"
            className="raSettingsButton raSettingsButtonPrimary"
            disabled={
              busy ||
              !content.trim() ||
              !data.enabled ||
              new TextEncoder().encode(content).length > data.limits.factBytes
            }
          >
            {tr("arc.workspace.arcMemoryPanel.saveMemory")}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="arcMemoryError">
          {error}
        </p>
      )}
      <section className="raSettingsSurface arcMemoryList">
        <div className="arcMemoryListHeader">
          <div role="group" aria-label={tr("arc.workspace.arcMemoryPanel.memoryType")}>
            {(["fact", "work"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === "fact"
                  ? tr("arc.workspace.arcMemoryPanel.personalNotes")
                  : tr("arc.workspace.arcMemoryPanel.recentWork")}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label={tr("arc.workspace.arcMemoryPanel.searchMemory")}
            placeholder={tr("arc.workspace.arcMemoryPanel.searchNotes")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {!memories.length ? (
          <p className="arcMemoryEmpty">
            {query
              ? tr("arc.workspace.arcMemoryPanel.noMatchingNotes")
              : kind === "fact"
                ? tr("arc.workspace.arcMemoryPanel.addANoteHereOrAsk")
                : tr("arc.workspace.arcMemoryPanel.conversationRecapsAppearHereAfterArc")}
          </p>
        ) : (
          memories.map((memory) => (
            <article key={memory.id}>
              <div className="arcMemoryMeta">
                <span>{label(memory.category)}</span>
                <time dateTime={memory.updated_at}>
                  {new Date(memory.updated_at).toLocaleDateString()}
                </time>
              </div>
              <p>{memory.content}</p>
              <footer>
                {memory.source_session_id && (
                  <a
                    href={
                      "/dashboard/agent/chat?session=" +
                      encodeURIComponent(memory.source_session_id)
                    }
                  >
                    {tr("arc.workspace.arcMemoryPanel.sourceConversation")}{" "}
                    <Icon name="arrowUpRight" size={12} />
                  </a>
                )}
                <span />
                {memory.kind === "fact" && (
                  <button
                    type="button"
                    className="raSettingsButton"
                    disabled={busy || !data.enabled}
                    onClick={() => {
                      setEditing(memory.id);
                      setContent(memory.content);
                      setCategory(memory.category);
                      document.querySelector("#arc-memory-content")?.scrollIntoView({
                        block: "center",
                        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                          ? "auto"
                          : "smooth",
                      });
                      (
                        document.querySelector("#arc-memory-content") as HTMLTextAreaElement
                      )?.focus();
                    }}
                  >
                    {tr("arc.workspace.arcMemoryPanel.edit")}
                  </button>
                )}
                <button
                  type="button"
                  className="raSettingsButton"
                  disabled={busy}
                  onClick={() => void action("memory/" + encodeURIComponent(memory.id), "DELETE")}
                  aria-label={tr("arc.workspace.arcMemoryPanel.deleteMemory")}
                >
                  <Icon name="trash" size={15} />
                </button>
              </footer>
            </article>
          ))
        )}
      </section>
      <section className="raSettingsSurface">
        <h3>{tr("arc.workspace.arcMemoryPanel.yourMemoryYourControl")}</h3>
        <p>{tr("arc.workspace.arcMemoryPanel.turningMemoryOffStopsNewSaves")}</p>
        {clear ? (
          <div
            className="arcMemoryClear"
            role="group"
            aria-label={tr("arc.workspace.arcMemoryPanel.confirmClearingMemory")}
          >
            <span>{tr("arc.workspace.arcMemoryPanel.clearAllSavedMemory")}</span>
            <button
              type="button"
              className="raSettingsButton"
              disabled={busy}
              onClick={() => setClear(false)}
            >
              {tr("arc.workspace.arcMemoryPanel.cancel")}
            </button>
            <button
              type="button"
              className="raSettingsButton"
              disabled={busy}
              onClick={() =>
                void action("memory/settings", "POST", { enabled: data.enabled, clear: true }).then(
                  (ok) => {
                    if (ok) {
                      setClear(false);
                      setEditing(null);
                      setContent("");
                    }
                  },
                )
              }
            >
              {tr("arc.workspace.arcMemoryPanel.clearAll")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="raSettingsButton"
            disabled={busy || !data.memories.length}
            onClick={() => setClear(true)}
          >
            {tr("arc.workspace.arcMemoryPanel.clearSavedMemory")}
          </button>
        )}
      </section>
    </div>
  );
}
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
