import { useStudioLocale } from "./locale.js";
import { translateStudio } from "./strings.js";
import { LanguageSwitcher } from "../i18n.js";
import { useTheme } from "../theme.js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  newStudioDocument,
  newStudioScene,
  studioDuration,
  STUDIO_SCENE_KINDS,
  type StudioAsset,
  type StudioDocument,
  type StudioJob,
  type StudioProject,
  type StudioProjectSummary,
  type StudioScene,
  type StudioVersion,
} from "@remotearc/protocol/studio";
import {
  studioApi,
  studioErrorMessage,
  StudioApiError,
  type StudioConfig,
} from "./api.js";
import { StudioPlayer } from "./player.js";
import { StudioQualityPanel } from "./quality-panel.js";
import { studioTemplate } from "./templates.js";
import "./studio.css";

type User = { id: string; name: string | null; email: string };
const kindLabels: Record<StudioScene["kind"], string> = {
  title: "开场",
  feature: "特写",
  list: "要点",
  quote: "引言",
  stats: "数据",
  outro: "结尾",
};
const active = (job: StudioJob) =>
  job.status === "queued" || job.status === "running";
const errorText = (error: unknown, locale: "en" | "zh" = "zh") =>
  error instanceof StudioApiError
    ? studioErrorMessage(error.code, locale)
    : translateStudio(
        error instanceof Error
          ? error.message.startsWith("STUDIO_")
            ? studioErrorMessage(error.message, locale)
            : error.message
          : "操作暂未完成，请重试。",
        locale,
      );
const time = (frames: number) => `${(frames / 30).toFixed(1)}s`;
function Mark() {
  return (
    <span className="st-mark" aria-hidden="true">
      <img src="/remote-arc.svg" alt="" />
    </span>
  );
}
function StudioControls() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useStudioLocale();
  return (
    <div className="st-product-controls">
      <LanguageSwitcher compact syncUrl />
      <button
        type="button"
        className="st-icon-button st-theme-toggle"
        aria-label={t(resolvedTheme === "dark" ? "切换到浅色" : "切换到深色")}
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {resolvedTheme === "dark" ? "☀" : "☾"}
      </button>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  error,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  error?: string;
}) {
  const { locale, t } = useStudioLocale();

  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`st-modal ${wide ? "st-modal-wide" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="st-modal-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="st-icon-button"
          onClick={onClose}
          aria-label={t("关闭")}
        >
          ×
        </button>
      </div>
      {error ? (
        <div className="st-modal-error" role="alert">
          {t(error)}
        </div>
      ) : null}
      {children}
    </dialog>
  );
}
function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { locale, t } = useStudioLocale();

  return (
    <div className="st-empty">
      <div className="st-empty-art">
        <span />
        <span />
        <span />
      </div>
      <h3>{t("你的下一条视频，从这里开始。")}</h3>
      <p>{t("带上想法和素材，把它变成可以反复打磨的作品。")}</p>
      <button type="button" className="st-button st-primary" onClick={onCreate}>
        {" "}
        {t("＋ 创建第一个作品")}{" "}
      </button>
    </div>
  );
}

export function Studio({ user }: { user: User | null | undefined }) {
  const { locale, t } = useStudioLocale();
  useEffect(() => {
    globalThis.document.title = "ReArc Studio";
  }, [locale]);

  const [config, setConfig] = useState<StudioConfig | null>(null),
    [projects, setProjects] = useState<StudioProjectSummary[]>([]),
    [project, setProject] = useState<StudioProject | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [initialGenerate, setInitialGenerate] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    epoch = useRef(0);
  const report = useCallback((message: string) => setError(message), []);
  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    setLoading(true);
    try {
      const [settings, list] = await Promise.all([
        studioApi.config(),
        studioApi.projects(),
      ]);
      if (current === epoch.current) {
        setConfig(settings);
        setProjects(list.projects);
      }
    } catch (e) {
      if (current === epoch.current) setError(errorText(e, locale));
    } finally {
      if (current === epoch.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (user) void refresh();
    else setLoading(false);
  }, [user?.id, refresh]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      const value = await studioApi.project(id);
      setProject(value.project);
      const url = new URL(location.href);
      url.searchParams.set("project", id);
      history.replaceState(null, "", url);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (user) {
      const id = new URL(location.href).searchParams.get("project");
      if (id && /^[A-Za-z0-9_-]{1,100}$/.test(id)) void open(id);
    }
  }, [user?.id]);
  async function create(document: StudioDocument, generate = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const value = await studioApi.create(document);
      setCreating(false);
      setInitialGenerate(generate);
      setProject(value.project);
      const url = new URL(location.href);
      url.searchParams.set("project", value.project.id);
      history.replaceState(null, "", url);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function importProject(selected: File) {
    setBusy(true);
    setError("");
    try {
      const { importStudioArchive } = await import("./archive.js");
      const restored = await importStudioArchive(selected);
      setProject(restored);
      const url = new URL(location.href);
      url.searchParams.set("project", restored.id);
      history.replaceState(null, "", url);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  function back() {
    setProject(null);
    setInitialGenerate(false);
    const url = new URL(location.href);
    url.searchParams.delete("project");
    history.replaceState(null, "", url);
    void refresh();
  }
  if (user === undefined)
    return (
      <div className="workspaceSurface studio-root st-gate">
        <StudioControls />
        <Mark />
        <p>{t("正在打开创作空间…")}</p>
      </div>
    );
  if (!user)
    return (
      <div className="workspaceSurface studio-root st-gate">
        <StudioControls />
        <div className="st-gate-card">
          <div className="st-wordmark">
            <Mark />
            <span className="st-rearc">ReArc</span>
            <span className="st-product-name">Studio</span>
          </div>
          <h1>
            {" "}
            {t("让想法，")} <br /> {t("成为下一条视频。")}{" "}
          </h1>
          <p>{t("从分镜到成片，每一处都可以继续打磨。")}</p>
          <a
            className="st-button st-primary"
            href={`/auth/login?return_to=${encodeURIComponent(location.href)}`}
          >
            {" "}
            {t("登录 Remote Arc →")}{" "}
          </a>
          <a className="st-text-link" href="https://remotearc.app">
            {" "}
            {t("了解 Remote Arc ↗")}{" "}
          </a>
        </div>
        <div className="st-gate-visual">
          <span>
            YOUR NEXT
            <br />
            <i>GREAT STORY.</i>
          </span>
          <small>IDEA → STORYBOARD → FILM</small>
        </div>
      </div>
    );
  if (project)
    return (
      <Editor
        key={project.id}
        initialProject={project}
        config={config}
        user={user}
        onBack={back}
        initialGenerate={initialGenerate}
      />
    );
  return (
    <div className="workspaceSurface studio-root">
      <header className="st-home-header">
        <div className="st-wordmark">
          <Mark />
          <span className="st-rearc">ReArc</span>
          <span className="st-product-name">Studio</span>
        </div>
        <nav>
          <StudioControls />
          <a href="https://agent.remotearc.app/overview">
            {t("Arc 工作区 ↗")}
          </a>
          <span className="st-avatar" title={user.email}>
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </span>
        </nav>
      </header>
      <main className="st-home">
        <section className="st-home-intro">
          <div>
            <span className="st-eyebrow">A SPACE FOR YOUR NEXT STORY</span>
            <h1>
              {" "}
              {t("从一个想法，")} <br />
              <em>{t("到一条好视频。")}</em>
            </h1>
            <p>
              {" "}
              {t("编排故事、设计画面、打磨每一秒。")} <br />{" "}
              {t("让创作保持自由，让修改始终简单。")}{" "}
            </p>
            <div className="st-actions">
              <button
                type="button"
                className="st-button st-primary"
                onClick={() => setCreating(true)}
                disabled={busy}
              >
                {" "}
                {t("＋ 新建作品")}{" "}
              </button>
              <button
                type="button"
                className="st-button"
                onClick={() => file.current?.click()}
                disabled={busy}
              >
                {" "}
                {t("导入项目")}{" "}
              </button>
              <input
                hidden
                ref={file}
                type="file"
                accept=".json,.arcvideo,application/json"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void importProject(selected);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="st-hero-art" aria-hidden="true">
            <div className="st-art-label">STUDIO / 001</div>
            <div className="st-art-title">
              Make
              <br />
              <i>it move.</i>
            </div>
            <img className="st-art-logo" src="/remote-arc.svg" alt="" />
            <div className="st-art-track">
              <span />
              <span />
              <span />
              <span />
            </div>
            <small>YOUR IDEAS. FRAME BY FRAME.</small>
          </div>
        </section>
        {error ? (
          <div role="alert" className="st-alert">
            {t(error)}
            <button
              type="button"
              onClick={() => setError("")}
              aria-label={t("关闭提示")}
            >
              ×
            </button>
          </div>
        ) : null}
        <section className="st-project-section">
          <div className="st-section-heading">
            <h2>
              {" "}
              {t("我的作品")} <span>{projects.length}</span>
            </h2>
            <button
              type="button"
              className="st-text-button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {" "}
              {t("刷新 ↻")}{" "}
            </button>
          </div>
          {loading ? (
            <div className="st-loading" role="status">
              {" "}
              {t("正在读取你的作品…")}{" "}
            </div>
          ) : projects.length ? (
            <div className="st-project-grid">
              {projects.map((item) => (
                <button
                  type="button"
                  className="st-project-card"
                  key={item.id}
                  onClick={() => void open(item.id)}
                  disabled={busy}
                >
                  <div
                    className={`st-project-cover st-cover-${item.format}`}
                    style={
                      { "--st-card-accent": item.accent } as React.CSSProperties
                    }
                  >
                    <span>REARC STUDIO</span>
                    <strong>{item.title}</strong>
                    <i />
                    <small>
                      {item.sceneCount} {t("个分镜 ·")}{" "}
                      {time(item.durationFrames)}
                    </small>
                  </div>
                  <div className="st-project-meta">
                    <h3>{item.title}</h3>
                    <p>
                      {new Date(item.updatedAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                      )}{" "}
                      · v{item.revision}
                      <span>{t("打开 ↗")}</span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState onCreate={() => setCreating(true)} />
          )}
        </section>
        <section className="st-template-section">
          <div className="st-section-heading">
            <h2>{t("从一个方向开始")}</h2>
            <span>{t("每个模板都可以自由修改")}</span>
          </div>
          <div className="st-template-grid">
            {(
              [
                {
                  id: "product",
                  name: t("产品介绍"),
                  copy: t("把功能，讲成看得见的价值。"),
                  symbol: "↗",
                },
                {
                  id: "explainer",
                  name: t("知识讲解"),
                  copy: t("让复杂的概念，变得容易理解。"),
                  symbol: "◎",
                },
                {
                  id: "report",
                  name: t("数据故事"),
                  copy: t("让真实的数据，带出一个发现。"),
                  symbol: "▥",
                },
              ] as const
            ).map((item) => (
              <button
                type="button"
                key={item.id}
                className={`st-template st-template-${item.id}`}
                disabled={busy}
                onClick={() => void create(studioTemplate(item.id, locale))}
              >
                <span>{item.symbol}</span>
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.copy}</p>
                </div>
                <b>↗</b>
              </button>
            ))}
          </div>
        </section>
        <footer className="st-home-footer">
          <span>REARC STUDIO</span>
          <span>{t("故事由你决定，细节可以继续打磨。")}</span>
        </footer>
      </main>
      {creating ? (
        <NewProject
          error={t(error)}
          busy={busy}
          aiAvailable={Boolean(config?.generationAvailable)}
          onClose={() => setCreating(false)}
          onCreate={create}
        />
      ) : null}
    </div>
  );
}

function NewProject({
  busy,
  aiAvailable,
  onClose,
  onCreate,
  error,
}: {
  error: string;
  busy: boolean;
  aiAvailable: boolean;
  onClose: () => void;
  onCreate: (doc: StudioDocument, generate: boolean) => Promise<void>;
}) {
  const { locale, t } = useStudioLocale();

  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [format, setFormat] = useState<StudioDocument["format"]>("landscape");
  function submit(generate: boolean) {
    if (!title.trim()) return;
    const doc = newStudioDocument(title.trim(), brief, locale);
    doc.format = format;
    void onCreate(doc, generate);
  }
  return (
    <Modal title={t("开始一个新作品")} error={t(error)} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <label className="st-field">
          {" "}
          {t("作品名称")}{" "}
          <input
            autoFocus
            value={title}
            maxLength={120}
            required
            placeholder={t("给你的下一条视频起个名字")}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="st-field">
          {" "}
          {t("你想讲什么？")}{" "}
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={12000}
            rows={5}
            placeholder={t(
              "告诉我们视频的用途、观众和重点。粘贴真实资料，能让故事更准确。",
            )}
          />
        </label>
        <label className="st-field">
          {" "}
          {t("画面比例")}{" "}
          <select
            value={format}
            onChange={(e) =>
              setFormat(e.target.value as StudioDocument["format"])
            }
          >
            <option value="landscape">{t("16:9 · 横屏")}</option>
            <option value="portrait">{t("9:16 · 竖屏")}</option>
            <option value="square">{t("1:1 · 方形")}</option>
          </select>
        </label>
        <div className="st-modal-actions">
          <button
            className="st-button"
            type="submit"
            disabled={busy || !title.trim()}
          >
            {" "}
            {t("创建空白作品")}{" "}
          </button>
          <button
            className="st-button st-primary"
            type="button"
            disabled={busy || !title.trim() || !brief.trim() || !aiAvailable}
            onClick={() => submit(true)}
          >
            {busy ? t("正在创建…") : t("✦ 生成分镜")}
          </button>
        </div>
        {!aiAvailable ? (
          <p className="st-help">
            {" "}
            {t("当前环境尚未启用 Arc AI，可先用模板或手动编排。")}{" "}
          </p>
        ) : (
          <p className="st-help">
            {" "}
            {t(
              "AI 编排使用你的 Arc 账户 Credits。素材与数字以你提供的资料为准。",
            )}{" "}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Editor({
  initialProject,
  config: initialConfig,
  user,
  onBack,
  initialGenerate,
}: {
  initialProject: StudioProject;
  config: StudioConfig | null;
  user: User;
  onBack: () => void;
  initialGenerate: boolean;
}) {
  const { locale, t } = useStudioLocale();

  const [saved, setSaved] = useState(initialProject),
    [document, setDocument] = useState(initialProject.document),
    [config, setConfig] = useState(initialConfig),
    [assets, setAssets] = useState<StudioAsset[]>([]),
    [versions, setVersions] = useState<StudioVersion[]>([]),
    [jobs, setJobs] = useState<StudioJob[]>([]),
    [selected, setSelected] = useState(initialProject.document.scenes[0]!.id),
    [seek, setSeek] = useState(
      Math.min(30, initialProject.document.scenes[0]!.durationFrames - 1),
    ),
    [tab, setTab] = useState<"content" | "style" | "assets">("content"),
    [prompt, setPrompt] = useState(""),
    [model, setModel] = useState("auto"),
    [skillIds, setSkillIds] = useState(["remotion-video"]),
    [onlySelected, setOnlySelected] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [showVersions, setShowVersions] = useState(false),
    [showExport, setShowExport] = useState(false),
    [qualityBlocked, setQualityBlocked] = useState(true),
    [exporting, setExporting] = useState(false),
    [exportProgress, setExportProgress] = useState(0),
    [exportHeight, setExportHeight] = useState<720 | 1080>(1080),
    [showDelete, setShowDelete] = useState(false),
    [historyIndex, setHistoryIndex] = useState(0);
  const undo = useRef<StudioDocument[]>([]),
    redo = useRef<StudioDocument[]>([]),
    upload = useRef<HTMLInputElement>(null),
    exportAbort = useRef<AbortController | null>(null),
    saveLock = useRef(false),
    initialStarted = useRef(false),
    latest = useRef({ document, saved });
  latest.current = { document, saved };
  const pendingGeneration = useRef<{ key: string; requestId: string } | null>(
    null,
  );
  const running = jobs.find(active),
    locked = busy || Boolean(running) || exporting,
    dirty = JSON.stringify(document) !== JSON.stringify(saved.document),
    scene =
      document.scenes.find((item) => item.id === selected) ||
      document.scenes[0]!;
  const report = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      studioApi.assets(saved.id),
      studioApi.versions(saved.id),
      studioApi.jobs(saved.id),
      initialConfig ? Promise.resolve(initialConfig) : studioApi.config(),
    ])
      .then(([media, history, work, settings]) => {
        if (!cancelled) {
          setAssets(media.assets);
          setVersions(history.versions);
          setJobs(work.jobs);
          setConfig(settings);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e, locale));
      });
    return () => {
      cancelled = true;
      exportAbort.current?.abort();
    };
  }, [saved.id]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await studioApi.job(saved.id, running.id);
        if (cancelled) return;
        setJobs((previous) =>
          previous.map((job) => (job.id === value.job.id ? value.job : job)),
        );
        if (value.job.status === "completed" && value.project) {
          undo.current.push(latest.current.document);
          redo.current = [];
          setHistoryIndex((i) => i + 1);
          setDocument(value.project.document);
          setSaved(value.project);
          setSelected(value.project.document.scenes[0]!.id);
          setSeek(0);
          setNotice(t("新的分镜已保存，可以继续打磨。"));
        }
        if (active(value.job)) timer = setTimeout(() => void poll(), 1500);
        else if (value.job.error)
          setError(studioErrorMessage(value.job.error, locale));
      } catch (e) {
        if (!cancelled) {
          setError(errorText(e, locale));
          timer = setTimeout(() => void poll(), 4000);
        }
      }
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [running?.id, saved.id]);
  useEffect(() => {
    if (
      initialGenerate &&
      config?.generationAvailable &&
      !initialStarted.current
    ) {
      initialStarted.current = true;
      void generate(initialProject.document.brief, "generate");
    }
  }, [config?.generationAvailable]);
  function update(next: StudioDocument) {
    undo.current = [...undo.current.slice(-49), document];
    redo.current = [];
    setHistoryIndex((i) => i + 1);
    setDocument(next);
    let frame = 0;
    for (const item of next.scenes) {
      if (item.id === selected) break;
      frame += item.durationFrames;
    }
    setSeek(Math.min(frame, studioDuration(next) - 1));
    setNotice("");
  }
  function updateScene(patch: Partial<StudioScene>) {
    update({
      ...document,
      scenes: document.scenes.map((item) =>
        item.id === scene.id ? { ...item, ...patch } : item,
      ),
    });
  }
  function choose(id: string) {
    setSelected(id);
    let start = 0;
    for (const item of document.scenes) {
      if (item.id === id) break;
      start += item.durationFrames;
    }
    const target = document.scenes.find((item) => item.id === id);
    setSeek(start + Math.min(30, (target?.durationFrames || 30) - 1));
  }
  function undoEdit() {
    const previous = undo.current.pop();
    if (previous) {
      redo.current.push(document);
      setDocument(previous);
      setHistoryIndex((i) => i + 1);
    }
  }
  function redoEdit() {
    const next = redo.current.pop();
    if (next) {
      undo.current.push(document);
      setDocument(next);
      setHistoryIndex((i) => i + 1);
    }
  }
  async function save(label = t("手动编辑")): Promise<StudioProject> {
    if (saveLock.current) throw Error(t("作品正在保存，请稍候。"));
    if (!dirty) return saved;
    saveLock.current = true;
    setBusy(true);
    try {
      const value = await studioApi.save({ ...saved, document }, label);
      setSaved(value.project);
      setNotice(t("所有修改已保存。"));
      return value.project;
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  async function saveClick() {
    setError("");
    try {
      await save();
    } catch (e) {
      setError(errorText(e, locale));
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!locked) void saveClick();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [document, saved, locked]);
  async function generate(value = prompt, mode: "generate" | "edit" = "edit") {
    if (!value.trim() || locked) return;
    setError("");
    setBusy(true);
    try {
      const base = dirty ? await save(t("AI 编排前保存")) : saved;
      setBusy(true);
      const input = {
          baseRevision: base.revision,
          prompt: value,
          mode,
          selectedSceneId: onlySelected ? scene.id : null,
          modelId: model,
          skillIds,
        },
        key = JSON.stringify(input);
      if (pendingGeneration.current?.key !== key)
        pendingGeneration.current = { key, requestId: crypto.randomUUID() };
      const work = await studioApi.generate(saved.id, {
        ...input,
        requestId: pendingGeneration.current.requestId,
      });
      pendingGeneration.current = null;
      setJobs((previous) => [
        work.job,
        ...previous.filter((job) => job.id !== work.job.id),
      ]);
      if (work.job.status === "completed") {
        const current = await studioApi.project(saved.id);
        setSaved(current.project);
        setDocument(current.project.document);
      }
      setPrompt("");
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  function addScene() {
    if (document.scenes.length >= 12) {
      setError(t("最多支持 12 个分镜。"));
      return;
    }
    const next = newStudioScene("feature", locale);
    update({ ...document, scenes: [...document.scenes, next] });
    setSelected(next.id);
    setSeek(studioDuration(document));
  }
  function moveScene(direction: number) {
    const index = document.scenes.findIndex((item) => item.id === scene.id),
      target = index + direction;
    if (target < 0 || target >= document.scenes.length) return;
    const scenes = [...document.scenes];
    [scenes[index], scenes[target]] = [scenes[target]!, scenes[index]!];
    update({ ...document, scenes });
  }
  function removeScene() {
    if (document.scenes.length === 1) return;
    const scenes = document.scenes.filter((item) => item.id !== scene.id);
    update({ ...document, scenes });
    setSelected(scenes[0]!.id);
    setSeek(0);
  }
  function duplicateScene() {
    if (document.scenes.length >= 12) return;
    const index = document.scenes.findIndex((item) => item.id === scene.id),
      copy = { ...structuredClone(scene), id: crypto.randomUUID() };
    update({
      ...document,
      scenes: [
        ...document.scenes.slice(0, index + 1),
        copy,
        ...document.scenes.slice(index + 1),
      ],
    });
    setSelected(copy.id);
  }
  async function uploadFile(file: File) {
    setError("");
    setBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024) throw Error(t("单个素材最多 25 MB。"));
      const value = await studioApi.upload(saved.id, file);
      setAssets((previous) => [value.asset, ...previous]);
      if (
        value.asset.type.startsWith("image/") ||
        value.asset.type.startsWith("video/")
      )
        updateScene({ mediaAssetId: value.asset.id });
      else
        update({ ...document, voice: { assetId: value.asset.id, volume: 1 } });
      setNotice(t("素材已上传，可在素材面板中使用。"));
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function exportVideo() {
    setError("");
    setExporting(true);
    setExportProgress(0);
    const controller = new AbortController();
    exportAbort.current = controller;
    try {
      const snapshot = dirty ? await save(t("导出前保存")) : saved;
      const { exportStudioVideo, downloadStudioFile } = await import(
        "./export.js"
      );
      const result = await exportStudioVideo(
        snapshot.id,
        snapshot.document,
        assets,
        {
          height: exportHeight,
          signal: controller.signal,
          onProgress: setExportProgress,
        },
      );
      downloadStudioFile(result.blob, result.name);
      setNotice(
        t("已导出 {0} 的 MP4。", time(studioDuration(snapshot.document))),
      );
      setShowExport(false);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setExporting(false);
      exportAbort.current = null;
    }
  }
  async function downloadProject() {
    setError("");
    setBusy(true);
    try {
      const [{ downloadStudioFile }, { createStudioArchive }] =
        await Promise.all([import("./export.js"), import("./archive.js")]);
      const archive = await createStudioArchive(saved.id, document, assets);
      downloadStudioFile(
        archive,
        `${document.title.replace(/[^\p{L}\p{N}_-]/gu, "_")}.arcvideo`,
      );
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function captions() {
    const { downloadStudioFile, exportStudioCaptions } = await import(
      "./export.js"
    );
    const srt = exportStudioCaptions(document);
    if (!srt) {
      setError(t("请先在分镜中填写旁白，字幕会按分镜时长分配。"));
      return;
    }
    downloadStudioFile(
      new Blob([srt], { type: "text/plain;charset=utf-8" }),
      "captions.srt",
    );
  }
  async function loadVersions() {
    setShowVersions(true);
    try {
      setVersions((await studioApi.versions(saved.id)).versions);
    } catch (e) {
      setError(errorText(e, locale));
    }
  }
  async function restore(revision: number) {
    setBusy(true);
    try {
      const base = dirty ? await save(t("恢复历史版本前保存")) : saved;
      setBusy(true);
      const result = await studioApi.restore(saved.id, base.revision, revision);
      undo.current.push(document);
      redo.current = [];
      setDocument(result.project.document);
      setSaved(result.project);
      setShowVersions(false);
      setNotice(t("已恢复版本 {0}，并保存为新版本。", revision));
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  function back() {
    if (dirty) {
      setError(t("还有未保存的修改，请先保存作品或下载项目备份。"));
      return;
    }
    if (locked) return;
    onBack();
  }
  const audio = assets.filter((item) => item.type.startsWith("audio/")),
    visual = assets.filter((item) => !item.type.startsWith("audio/"));
  return (
    <div
      className="workspaceSurface studio-root st-editor"
      data-history={historyIndex}
    >
      <header className="st-editor-header">
        <div className="st-editor-title">
          <button
            type="button"
            className="st-icon-button"
            onClick={back}
            disabled={locked}
            aria-label={t("返回作品列表")}
          >
            ←
          </button>
          <div className="st-wordmark">
            <Mark />
            <span className="st-rearc">ReArc</span>
            <span className="st-product-name">Studio</span>
          </div>
          <span className="st-header-divider" />
          <input
            aria-label={t("作品名称")}
            maxLength={120}
            value={document.title}
            disabled={locked}
            onChange={(e) => update({ ...document, title: e.target.value })}
          />
          <span className={`st-save-state ${dirty ? "is-dirty" : ""}`}>
            {busy
              ? t("处理中…")
              : dirty
                ? t("● 未保存")
                : t("已保存 · v{0}", saved.revision)}
          </span>
        </div>
        <div className="st-header-actions">
          <StudioControls />
          <button
            type="button"
            className="st-icon-button"
            onClick={undoEdit}
            disabled={locked || !undo.current.length}
            aria-label={t("撤销")}
          >
            ↶
          </button>
          <button
            type="button"
            className="st-icon-button"
            onClick={redoEdit}
            disabled={locked || !redo.current.length}
            aria-label={t("重做")}
          >
            ↷
          </button>
          <button
            type="button"
            className="st-button st-small"
            onClick={() => void loadVersions()}
            disabled={locked}
          >
            {" "}
            {t("版本")}{" "}
          </button>
          <button
            type="button"
            className="st-button st-small"
            onClick={() => void saveClick()}
            disabled={locked || !dirty}
          >
            {" "}
            {t("保存")}{" "}
          </button>
          <button
            type="button"
            className="st-button st-primary st-small"
            onClick={() => setShowExport(true)}
            disabled={locked}
          >
            {" "}
            {t("导出 ↗")}{" "}
          </button>
          <span className="st-avatar" title={user.email}>
            {(user.name || user.email)[0]}
          </span>
        </div>
      </header>
      {error || notice ? (
        <div
          className={`st-editor-message ${error ? "st-message-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {t(error || notice)}
          <button
            type="button"
            aria-label={t("关闭提示")}
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="st-editor-body">
        <aside className="st-director">
          <div className="st-panel-heading">
            <span>{t("✦ 创作助手")}</span>
            <small>{t("与你一起打磨故事")}</small>
          </div>
          <div className="st-director-messages">
            <div className="st-assistant-welcome">
              <span className="st-spark">✦</span>
              <h2>
                {" "}
                {t("一个好故事，")} <br /> {t("值得慢慢打磨。")}{" "}
              </h2>
              <p>
                {" "}
                {t(
                  "告诉我想修改什么。可以重写旁白、调整节奏，也可以只打磨选中的分镜。",
                )}{" "}
              </p>
            </div>
            {[...jobs].reverse().map((job) => (
              <div key={job.id} className="st-conversation">
                <div className="st-user-message">
                  {job.prompt || t("生成分镜")}
                </div>
                <div className="st-assistant-message">
                  {active(job) ? (
                    <>
                      <span className="st-pulse" /> {t("正在编排分镜…")}{" "}
                      <p>{t("完成后会保存为新版本。")}</p>
                    </>
                  ) : job.status === "completed" ? (
                    <>
                      <b>{t("✦ 分镜已更新")}</b>
                      <p>{job.explanation || t("新版本已保存。")}</p>
                    </>
                  ) : job.status === "cancelled" ? (
                    t("已取消。已发送的模型请求仍可能计入用量。")
                  ) : (
                    <>
                      <b>
                        {job.status === "unknown"
                          ? t("结果待核实")
                          : job.status === "conflict"
                            ? t("版本发生变化")
                            : t("本次编排未完成")}
                      </b>
                      <p>
                        {studioErrorMessage(
                          job.error || "STUDIO_GENERATION_FAILED",
                          locale,
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            className="st-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <textarea
              aria-label={t("给创作助手的要求")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={12000}
              rows={3}
              placeholder={t("比如：第三段更简洁，保留其他内容…")}
              disabled={locked || !config?.generationAvailable}
            />
            <div className="st-composer-scope">
              <label>
                <input
                  type="checkbox"
                  checked={onlySelected}
                  onChange={(e) => setOnlySelected(e.target.checked)}
                  disabled={locked}
                />{" "}
                {t("只修改当前分镜")}{" "}
              </label>
            </div>
            <div className="st-composer-tools">
              <select
                aria-label={t("创作模型")}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={locked}
              >
                {config?.models.length ? (
                  config.models
                    .filter((item) => item.configured)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))
                ) : (
                  <option value="auto">Auto</option>
                )}
              </select>
              {running ? (
                <button
                  type="button"
                  className="st-button st-small"
                  onClick={() =>
                    void studioApi
                      .cancel(saved.id, running.id)
                      .then(() =>
                        setJobs((previous) =>
                          previous.map((job) =>
                            job.id === running.id
                              ? { ...job, status: "cancelled" }
                              : job,
                          ),
                        ),
                      )
                      .catch((e) => setError(errorText(e, locale)))
                  }
                >
                  {" "}
                  {t("停止")}{" "}
                </button>
              ) : (
                <button
                  type="submit"
                  className="st-send"
                  aria-label={t("发送创作要求")}
                  disabled={
                    locked || !prompt.trim() || !config?.generationAvailable
                  }
                >
                  ↑
                </button>
              )}
            </div>
            <details className="st-skills">
              <summary>
                {t("创作 Skills ·")} {skillIds.length}
              </summary>
              {config?.skills.map((skill) => (
                <label key={skill.id}>
                  <input
                    type="checkbox"
                    checked={skillIds.includes(skill.id)}
                    disabled={
                      locked ||
                      (!skillIds.includes(skill.id) && skillIds.length >= 3)
                    }
                    onChange={(e) =>
                      setSkillIds((previous) =>
                        e.target.checked
                          ? [...previous, skill.id]
                          : previous.filter((id) => id !== skill.id),
                      )
                    }
                  />
                  <span title={skill.description}>{skill.name}</span>
                </label>
              ))}
            </details>
            {!config?.generationAvailable ? (
              <p className="st-help">
                {" "}
                {t("当前环境未启用 Arc AI。你可以手动编排、预览和导出。")}{" "}
              </p>
            ) : (
              <p className="st-help">
                {" "}
                {t("使用 Arc Credits ·")}{" "}
                <a
                  href="https://agent.remotearc.app/settings"
                  target="_blank"
                  rel="noreferrer"
                >
                  {" "}
                  {t("查看账户 ↗")}{" "}
                </a>
              </p>
            )}
          </form>
        </aside>
        <main className="st-cut">
          <div className="st-preview-heading">
            <span>{t("画面预览")}</span>
            <div>
              <select
                aria-label={t("画面比例")}
                value={document.format}
                disabled={locked}
                onChange={(e) =>
                  update({
                    ...document,
                    format: e.target.value as StudioDocument["format"],
                  })
                }
              >
                <option value="landscape">{t("16:9 横屏")}</option>
                <option value="portrait">{t("9:16 竖屏")}</option>
                <option value="square">{t("1:1 方形")}</option>
              </select>
              <small>{time(studioDuration(document))}</small>
            </div>
          </div>
          <StudioPlayer
            projectId={saved.id}
            document={document}
            assets={assets}
            seekFrame={seek}
            onError={report}
          />
          <section className="st-storyboard">
            <div className="st-section-heading">
              <h2>
                {" "}
                {t("分镜")} <span>{document.scenes.length} / 12</span>
              </h2>
              <button
                type="button"
                className="st-text-button"
                onClick={addScene}
                disabled={locked || document.scenes.length >= 12}
              >
                {" "}
                {t("＋ 添加分镜")}{" "}
              </button>
            </div>
            <div className="st-scene-track">
              {document.scenes.map((item, index) => (
                <button
                  type="button"
                  className={`st-scene ${item.id === scene.id ? "is-selected" : ""} st-scene-${item.background}`}
                  key={item.id}
                  onClick={() => choose(item.id)}
                >
                  <div
                    className="st-scene-thumb"
                    style={
                      {
                        "--scene-accent": document.theme.accent,
                      } as React.CSSProperties
                    }
                  >
                    <span>
                      {String(index + 1).padStart(2, "0")} ·{" "}
                      {t(kindLabels[item.kind])}
                    </span>
                    <strong>{item.title || t("未填写标题")}</strong>
                    <i />
                  </div>
                  <div>
                    <span>{time(item.durationFrames)}</span>
                    <span>
                      {item.narration ? t("有旁白文案") : t("无旁白文案")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <div className="st-editor-footnote">
            <span>{t("每一处修改，都有继续打磨的空间。")}</span>
            <span>
              {document.format === "portrait"
                ? "9:16"
                : document.format === "square"
                  ? "1:1"
                  : "16:9"}{" "}
              · 30 FPS
            </span>
          </div>
        </main>
        <aside className="st-inspector">
          <div
            className="st-inspector-tabs"
            role="tablist"
            aria-label={t("分镜设置")}
          >
            {(
              [
                { id: "content", label: t("内容") },
                { id: "style", label: t("样式") },
                { id: "assets", label: t("素材") },
              ] as const
            ).map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                key={item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="st-inspector-content">
            {tab === "content" ? (
              <fieldset disabled={locked} className="st-fieldset">
                <div className="st-inspector-label">
                  {" "}
                  {t("分镜")}{" "}
                  {document.scenes.findIndex((item) => item.id === scene.id) +
                    1}
                  <div>
                    <button
                      type="button"
                      className="st-icon-button"
                      onClick={() => moveScene(-1)}
                      aria-label={t("分镜前移")}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="st-icon-button"
                      onClick={() => moveScene(1)}
                      aria-label={t("分镜后移")}
                    >
                      →
                    </button>
                  </div>
                </div>
                <label className="st-field">
                  {" "}
                  {t("场景类型")}{" "}
                  <select
                    value={scene.kind}
                    onChange={(e) =>
                      updateScene({
                        kind: e.target.value as StudioScene["kind"],
                      })
                    }
                  >
                    {STUDIO_SCENE_KINDS.map((kind) => (
                      <option value={kind} key={kind}>
                        {t(kindLabels[kind])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="st-field">
                  {" "}
                  {t("上方小标题")}{" "}
                  <input
                    value={scene.kicker}
                    maxLength={60}
                    onChange={(e) => updateScene({ kicker: e.target.value })}
                  />
                </label>
                <label className="st-field">
                  {" "}
                  {t("主标题")}{" "}
                  <textarea
                    rows={2}
                    value={scene.title}
                    maxLength={120}
                    onChange={(e) => updateScene({ title: e.target.value })}
                  />
                </label>
                <label className="st-field">
                  {" "}
                  {t("说明文字")}{" "}
                  <textarea
                    rows={3}
                    value={scene.body}
                    maxLength={600}
                    onChange={(e) => updateScene({ body: e.target.value })}
                  />
                </label>
                <label className="st-field">
                  {" "}
                  {t("要点（每行一条，最多 6 条）")}{" "}
                  <textarea
                    rows={3}
                    value={scene.points.join("\n")}
                    maxLength={960}
                    onChange={(e) =>
                      updateScene({
                        points: e.target.value
                          .split("\n")
                          .slice(0, 6)
                          .map((point) => point.slice(0, 160)),
                      })
                    }
                  />
                </label>
                <label className="st-field">
                  {" "}
                  {t("旁白与字幕")}{" "}
                  <textarea
                    rows={4}
                    value={scene.narration}
                    maxLength={1600}
                    onChange={(e) => updateScene({ narration: e.target.value })}
                    placeholder={t("填写旁白文案，或上传录好的配音。")}
                  />
                </label>
                <p className="st-help">
                  {" "}
                  {t(
                    "字幕按分镜时长分配。旁白文案需要配合上传的音频使用。",
                  )}{" "}
                </p>
                <label className="st-field">
                  {" "}
                  {t("时长（秒）")}{" "}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={0.1}
                    value={scene.durationFrames / 30}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n))
                        updateScene({
                          durationFrames: Math.max(
                            30,
                            Math.min(900, Math.round(n * 30)),
                          ),
                        });
                    }}
                  />
                </label>
                <div className="st-scene-actions">
                  <button
                    type="button"
                    className="st-button st-small"
                    disabled={document.scenes.length >= 12}
                    onClick={duplicateScene}
                  >
                    {" "}
                    {t("复制分镜")}{" "}
                  </button>
                  <button
                    type="button"
                    className="st-text-button st-danger"
                    disabled={document.scenes.length === 1}
                    onClick={removeScene}
                  >
                    {" "}
                    {t("删除分镜")}{" "}
                  </button>
                </div>
              </fieldset>
            ) : null}
            {tab === "style" ? (
              <fieldset disabled={locked} className="st-fieldset">
                <div className="st-inspector-label">{t("作品风格")}</div>
                <label className="st-field st-color-field">
                  {" "}
                  {t("强调色")}{" "}
                  <input
                    aria-label={t("强调色")}
                    type="color"
                    value={document.theme.accent}
                    onChange={(e) =>
                      update({
                        ...document,
                        theme: { ...document.theme, accent: e.target.value },
                      })
                    }
                  />
                  <span>{document.theme.accent}</span>
                </label>
                <div className="st-swatches">
                  {[
                    "#38bdf8",
                    "#a7c5ff",
                    "#ffb88c",
                    "#d2b7ff",
                    "#ff8fa8",
                    "#a6e4d4",
                  ].map((color) => (
                    <button
                      type="button"
                      key={color}
                      aria-label={t("使用配色 {0}", color)}
                      style={{ background: color }}
                      onClick={() =>
                        update({
                          ...document,
                          theme: { ...document.theme, accent: color },
                        })
                      }
                    />
                  ))}
                </div>
                <label className="st-field">
                  {" "}
                  {t("字体")}{" "}
                  <select
                    value={document.theme.font}
                    onChange={(e) =>
                      update({
                        ...document,
                        theme: {
                          ...document.theme,
                          font: e.target
                            .value as StudioDocument["theme"]["font"],
                        },
                      })
                    }
                  >
                    <option value="sans">{t("现代无衬线")}</option>
                    <option value="serif">{t("叙事衬线")}</option>
                    <option value="mono">{t("等宽技术风格")}</option>
                  </select>
                </label>
                <div className="st-inspector-label">{t("当前分镜")}</div>
                <label className="st-field">
                  {" "}
                  {t("背景")}{" "}
                  <select
                    value={scene.background}
                    onChange={(e) =>
                      updateScene({
                        background: e.target.value as StudioScene["background"],
                      })
                    }
                  >
                    <option value="dark">{t("深色")}</option>
                    <option value="light">{t("浅色")}</option>
                    <option value="accent">{t("强调色")}</option>
                  </select>
                </label>
                <label className="st-field">
                  {" "}
                  {t("入场方式")}{" "}
                  <select
                    value={scene.transition}
                    onChange={(e) =>
                      updateScene({
                        transition: e.target.value as StudioScene["transition"],
                      })
                    }
                  >
                    <option value="fade">{t("淡入")}</option>
                    <option value="slide">{t("滑入")}</option>
                    <option value="cut">{t("直接切入")}</option>
                  </select>
                </label>
                <label className="st-check">
                  <input
                    type="checkbox"
                    checked={document.subtitles}
                    onChange={(e) =>
                      update({ ...document, subtitles: e.target.checked })
                    }
                  />{" "}
                  {t("显示字幕")}{" "}
                </label>
                <div className="st-inspector-label">{t("创作资料")}</div>
                <label className="st-field">
                  {" "}
                  {t("项目简报")}{" "}
                  <textarea
                    rows={6}
                    value={document.brief}
                    maxLength={12000}
                    onChange={(e) =>
                      update({ ...document, brief: e.target.value })
                    }
                  />
                </label>
              </fieldset>
            ) : null}
            {tab === "assets" ? (
              <div>
                <button
                  type="button"
                  className="st-upload-zone"
                  disabled={locked || !config?.uploadsAvailable}
                  onClick={() => upload.current?.click()}
                >
                  <span>＋</span>
                  <strong>{t("上传你的素材")}</strong>
                  <small>{t("图片、视频、配音或音乐 · 最大 25 MB")}</small>
                </button>
                <input
                  hidden
                  ref={upload}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/webm,video/quicktime,audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file);
                    e.target.value = "";
                  }}
                />
                <fieldset disabled={locked} className="st-fieldset">
                  <label className="st-field">
                    {" "}
                    {t("当前分镜画面")}{" "}
                    <select
                      value={scene.mediaAssetId || ""}
                      onChange={(e) =>
                        updateScene({ mediaAssetId: e.target.value || null })
                      }
                    >
                      <option value="">{t("使用动态设计")}</option>
                      {visual.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="st-field">
                    {" "}
                    {t("整片配音")}{" "}
                    <select
                      value={document.voice.assetId || ""}
                      onChange={(e) =>
                        update({
                          ...document,
                          voice: {
                            ...document.voice,
                            assetId: e.target.value || null,
                          },
                        })
                      }
                    >
                      <option value="">{t("无配音")}</option>
                      {audio.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="st-field">
                    {" "}
                    {t("配音音量")}{" "}
                    <input
                      type="range"
                      aria-label={t("配音音量")}
                      min={0}
                      max={1}
                      step={0.05}
                      value={document.voice.volume}
                      onChange={(e) =>
                        update({
                          ...document,
                          voice: {
                            ...document.voice,
                            volume: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="st-field">
                    {" "}
                    {t("背景音乐")}{" "}
                    <select
                      value={document.music.assetId || ""}
                      onChange={(e) =>
                        update({
                          ...document,
                          music: {
                            ...document.music,
                            assetId: e.target.value || null,
                          },
                        })
                      }
                    >
                      <option value="">{t("无背景音乐")}</option>
                      {audio.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="st-field">
                    {" "}
                    {t("音乐音量")}{" "}
                    <input
                      type="range"
                      aria-label={t("音乐音量")}
                      min={0}
                      max={1}
                      step={0.05}
                      value={document.music.volume}
                      onChange={(e) =>
                        update({
                          ...document,
                          music: {
                            ...document.music,
                            volume: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </fieldset>
                <p className="st-help">
                  {" "}
                  {t(
                    "视频素材的原音默认静音。配音从片头播放，音乐循环并在片尾淡出。",
                  )}{" "}
                </p>
                <div className="st-asset-list">
                  {assets.map((asset) => (
                    <div key={asset.id}>
                      {asset.type.startsWith("image/") ? (
                        <img
                          src={studioApi.assetUrl(saved.id, asset.id)}
                          alt={asset.name}
                          loading="lazy"
                        />
                      ) : (
                        <span>
                          {asset.type.startsWith("audio/") ? "♫" : "▷"}
                        </span>
                      )}
                      <div>
                        <strong>{asset.name}</strong>
                        <small>
                          {(asset.size / 1024 / 1024).toFixed(2)} MB
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="st-inspector-bottom">
            <button
              type="button"
              className="st-text-button"
              onClick={() => void downloadProject()}
            >
              {" "}
              {t("↓ 下载项目备份")}{" "}
            </button>
            <button
              type="button"
              className="st-text-button st-danger"
              disabled={locked}
              onClick={() => setShowDelete(true)}
            >
              {" "}
              {t("删除作品")}{" "}
            </button>
          </div>
        </aside>
      </div>
      {showVersions ? (
        <Modal
          title={t("版本历史")}
          error={t(error)}
          onClose={() => setShowVersions(false)}
        >
          <p className="st-help">
            {t("保留最近 100 个版本。恢复会创建新版本。")}
          </p>
          <div className="st-version-list">
            {versions.map((version) => (
              <div key={version.revision}>
                <div>
                  <strong>
                    v{version.revision} · {t(version.label)}
                  </strong>
                  <small>
                    {new Date(version.createdAt).toLocaleString(
                      locale === "zh" ? "zh-CN" : "en-US",
                    )}
                  </small>
                </div>
                <button
                  type="button"
                  className="st-button st-small"
                  disabled={busy || version.revision === saved.revision}
                  onClick={() => void restore(version.revision)}
                >
                  {version.revision === saved.revision
                    ? t("当前版本")
                    : t("恢复")}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
      {showExport ? (
        <Modal
          title={t("把作品带走")}
          error={t(error)}
          onClose={() => {
            if (!exporting) setShowExport(false);
          }}
        >
          <div className="st-export-summary">
            <span>MP4</span>
            <div>
              <strong>{document.title}</strong>
              <p>
                {time(studioDuration(document))} · {document.scenes.length}{" "}
                {t("个分镜 · 30 FPS")}{" "}
              </p>
            </div>
          </div>
          <StudioQualityPanel
            document={document}
            assets={assets}
            onBlocked={setQualityBlocked}
            onScene={(id) => {
              setShowExport(false);
              choose(id);
            }}
          />
          <label className="st-field">
            {" "}
            {t("视频清晰度")}{" "}
            <select
              value={exportHeight}
              disabled={exporting}
              onChange={(e) =>
                setExportHeight(Number(e.target.value) as 720 | 1080)
              }
            >
              <option value={1080}>{t("1080p · 高清")}</option>
              <option value={720}>{t("720p · 轻量")}</option>
            </select>
          </label>
          <p className="st-help">
            {" "}
            {t(
              "在当前浏览器中导出，请保持此页面打开。导出前会保存当前修改。推荐最新版 Chrome 或 Edge。",
            )}{" "}
          </p>
          {exporting ? (
            <div className="st-export-progress" role="status">
              <progress max={1} value={exportProgress} />
              <p>
                {t("正在导出 ·")} {Math.floor(exportProgress * 100)}%
              </p>
              <button
                type="button"
                className="st-button"
                onClick={() => exportAbort.current?.abort()}
              >
                {" "}
                {t("取消导出")}{" "}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="st-button st-primary st-export-primary"
                disabled={qualityBlocked}
                onClick={() => void exportVideo()}
              >
                {" "}
                {t("导出 MP4 ↗")}{" "}
              </button>
              <div className="st-modal-actions">
                <button
                  type="button"
                  className="st-text-button"
                  onClick={() => void downloadProject()}
                >
                  {" "}
                  {t("下载可编辑项目")}{" "}
                </button>
                <button
                  type="button"
                  className="st-text-button"
                  onClick={() => void captions()}
                >
                  {" "}
                  {t("下载字幕 SRT")}{" "}
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}
      {showDelete ? (
        <Modal
          title={t("删除这个作品？")}
          error={t(error)}
          onClose={() => setShowDelete(false)}
        >
          <p>{t("这会删除作品、版本和已上传的素材。建议先下载项目备份。")}</p>
          <div className="st-modal-actions">
            <button
              type="button"
              className="st-button"
              onClick={() => setShowDelete(false)}
            >
              {" "}
              {t("保留作品")}{" "}
            </button>
            <button
              type="button"
              className="st-button st-delete-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void studioApi
                  .remove(saved.id)
                  .then(onBack)
                  .catch((e) => {
                    setError(errorText(e, locale));
                    setShowDelete(false);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {" "}
              {t("确认删除")}{" "}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
