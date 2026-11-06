import type { Translate } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { communityExperience } from "./arc-community-experience.js";
import { workflowExperience } from "./arc-skill-experience.js";
import type { ArcMention } from "../../../hooks/arc/use-arc-skill-mentions.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/arc/skills/arc-skills.css";

type Skill = {
  id: string;
  name: string;
  description: string;
  sourceUrl: string | null;
  origin: "imported" | "builtin" | "community";
  owner?: string;
  requires?: string[];
  license?: string;
  revision?: string;
  resourceCount?: number;
  version?: string;
  category?: string;
  keywords?: string[];
  core?: boolean;
};
type Props = {
  tr: Translate;
  onChat: (prompt?: string, sessionId?: string, references?: ArcMention[]) => void;
};
export function ArcSkills({ tr, onChat }: Props) {
  const [resources, setResources] = useState<{ providers: string[]; computer: boolean }>({
    providers: [],
    computer: false,
  });
  const [skills, setSkills] = useState<Skill[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [importing, setImporting] = useState(false),
    [saving, setSaving] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [source, setSource] = useState(""),
    [content, setContent] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [category, setCategory] = useState("all");
  const upload = useRef<HTMLInputElement>(null),
    importHeading = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    arcRequest<{ skills: Skill[] }>("skills", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSkills(data.skills);
          setError("");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(tr("arc.skills.arcSkills.yourSkillLibraryCouldNotBe"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision, tr]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      fetch("/api/apps", { credentials: "same-origin", signal: controller.signal }).then((r) =>
        r.json().then(canonicalErrorEnvelope),
      ),
      fetch("/api/devices", { credentials: "same-origin", signal: controller.signal }).then((r) =>
        r.json().then(canonicalErrorEnvelope),
      ),
    ]).then(([apps, devices]) => {
      if (!controller.signal.aborted)
        setResources({
          providers:
            apps.status === "fulfilled"
              ? (apps.value.connections || [])
                  .filter((c: any) => c.status === "active")
                  .map((c: any) => c.provider)
              : [],
          computer:
            devices.status === "fulfilled" &&
            (Array.isArray(devices.value) ? devices.value : devices.value.devices || []).some(
              (d: any) => d.status === "online",
            ),
        });
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (importing) importHeading.current?.focus();
  }, [importing]);
  async function readFile(file: File) {
    if (file.size > 16000 || !file.name.toLowerCase().endsWith(".md")) {
      setError(tr("arc.skills.arcSkills.chooseAMarkdownFileUpTo"));
      return;
    }
    try {
      const text = await file.text();
      setContent(text);
      const field = (key: string) =>
        text
          .match(new RegExp("^" + key + ":\\s*[\"']?([^\\n\\r]+)", "m"))?.[1]
          ?.replace(/["']$/, "")
          .trim();
      setName((field("name") || file.name.replace(/\.md$/i, "")).slice(0, 100));
      setDescription((field("description") || "").slice(0, 500));
      setError("");
    } catch {
      setError(tr("arc.skills.arcSkills.thisFileCouldNotBeRead"));
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const skill = await arcRequest<Skill>("skills", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          content,
          ...(source ? { sourceUrl: source } : {}),
        }),
      });
      setSkills((previous) => [skill, ...previous.filter((item) => item.id !== skill.id)]);
      setImporting(false);
      setName("");
      setDescription("");
      setSource("");
      setContent("");
    } catch {
      setError(tr("arc.skills.arcSkills.couldNotImportThisSkillCheck"));
    } finally {
      setSaving(false);
    }
  }
  const visible = skills.filter(
    (skill) =>
      (filter === "all" || skill.origin === filter) &&
      (category === "all" || skill.category === category) &&
      [
        ...(skill.keywords || []),
        skill.name,
        skill.description,
        communityExperience(skill.id, tr)?.title,
        communityExperience(skill.id, tr)?.description,
        skill.owner,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  return (
    <section className="arcSkillsPage">
      <header className="overviewTopbar">
        <div>
          <span className="eyebrow">ARC / SKILLS</span>
          <h1>{tr("arc.skills.arcSkills.skillsFromThePeopleWhoBuild")}</h1>
          <p>{tr("arc.skills.arcSkills.localCreationWorkflowsOfficeSkillsAnd")}</p>
        </div>
        <button
          className="addButton arcRadiantCta"
          type="button"
          aria-expanded={importing}
          onClick={() => setImporting(!importing)}
        >
          <Icon name="add" />
          {tr("arc.skills.arcSkills.importASkill")}
        </button>
      </header>
      <div className="arcSkillGuide">
        <img src="/remote-arc.svg" alt="" />
        <div>
          <strong>{tr("arc.skills.arcSkills.yourGoalComesFirst")}</strong>
          <p>{tr("arc.skills.arcSkills.describeYourWorkInChatArc")}</p>
        </div>
        <button type="button" className="ghostButton" onClick={() => onChat()}>
          {tr("arc.skills.arcSkills.openArcChat")} →
        </button>
      </div>
      {error && (
        <div className="arcSkillError" role="alert">
          {error}
          <button
            type="button"
            className="ghostButton"
            onClick={() => setRevision((value) => value + 1)}
          >
            {tr("arc.skills.arcSkills.reloadLibrary")}
          </button>
        </div>
      )}
      {importing && (
        <form className="arcSkillImport" onSubmit={(event) => void save(event)}>
          <header>
            <h2>{tr("arc.skills.arcSkills.bringASkillToArc")}</h2>
            <button
              className="ghostButton"
              type="button"
              onClick={() => setImporting(false)}
              aria-label={tr("arc.skills.arcSkills.closeImport")}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="arcSkillImportFields">
            <label>
              {tr("arc.skills.arcSkills.name")}
              <input
                ref={importHeading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </label>
            <label>
              {tr("arc.skills.arcSkills.sourceLinkOptional")}
              <input
                type="url"
                pattern="https://.*"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={1000}
                placeholder="https://github.com/…"
              />
            </label>
            <label className="arcSkillWide">
              {tr("arc.skills.arcSkills.whatDoesThisSkillHelpWith")}
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </label>
          </div>
          <div className="arcSkillMarkdownLabel">
            <label htmlFor="arc-skill-content">SKILL.md</label>
            <button className="ghostButton" type="button" onClick={() => upload.current?.click()}>
              <Icon name="book" />
              {tr("arc.skills.arcSkills.chooseMdFile")}
            </button>
            <input
              ref={upload}
              type="file"
              accept=".md,text/markdown,text/plain"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <textarea
            id="arc-skill-content"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={12000}
            minLength={20}
            required
            placeholder={
              "---\nname: my-workflow\ndescription: A workflow Arc can reuse\n---\n\n# Instructions\n…"
            }
          />
          <footer>
            <p>{tr("arc.skills.arcSkills.importsInstructionsOnlyASourceLink")}</p>
            <button className="addButton arcRadiantCta" disabled={saving} type="submit">
              {saving
                ? tr("arc.skills.arcSkills.importing")
                : tr("arc.skills.arcSkills.addToLibrary")}
            </button>
          </footer>
        </form>
      )}
      <div className="arcSkillToolbar">
        <span className="arcSkillCount">
          {skills.length} {tr("arc.skills.arcSkills.skills")}
        </span>
        <select
          aria-label={tr("arc.skills.arcSkills.skillCategory")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {[
            ["all", tr("arc.skills.arcSkills.allCategories")],
            ["media", tr("arc.skills.arcSkills.videoAudioMaps")],
            ["cognition", tr("arc.skills.arcSkills.thinkingSkills")],
            ["office", tr("arc.skills.arcSkills.documentsOffice")],
            ["data", tr("arc.skills.arcSkills.dataAnalysis")],
            ["design", tr("arc.skills.arcSkills.design")],
            ["development", tr("arc.skills.arcSkills.development")],
            ["automation", tr("arc.skills.arcSkills.browserTesting")],
            ["browser", tr("arc.skills.arcSkills.browserWorkflows")],
            ["desktop", tr("arc.skills.arcSkills.desktop")],
            ["productivity", tr("arc.skills.arcSkills.researchRoutines")],
          ].map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <div role="group" aria-label={tr("arc.skills.arcSkills.skillSource")}>
          {[
            ["all", tr("arc.skills.arcSkills.allSkills")],
            ["imported", tr("arc.skills.arcSkills.yourImports")],
            ["community", tr("arc.skills.arcSkills.fromGithub")],
            ["builtin", tr("arc.skills.arcSkills.byRemoteArc")],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          <Icon name="search" />
          <input
            type="search"
            aria-label={tr("arc.skills.arcSkills.searchSkills")}
            placeholder={tr("arc.skills.arcSkills.findASkill")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <WorkspaceLoading label={tr("arc.skills.arcSkills.loadingYourLibrary")} variant="rows" />
      ) : visible.length ? (
        <div className="arcSkillGrid">
          {visible.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              resources={resources}
              tr={tr}
              onUse={() =>
                onChat(workflowExperience(skill.id, tr)?.prompt, undefined, [
                  {
                    kind: "skill",
                    id: skill.id,
                    name:
                      communityExperience(skill.id, tr)?.title ||
                      workflowExperience(skill.id, tr)?.title ||
                      skill.name,
                    description: skill.description,
                  },
                ])
              }
              onRemove={async () => {
                try {
                  await arcRequest("skills/" + encodeURIComponent(skill.id), { method: "DELETE" });
                  setSkills((items) => items.filter((s) => s.id !== skill.id));
                } catch {
                  setError(tr("arc.skills.arcSkills.theSkillCouldNotBeRemoved"));
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="arcWorkEmpty">
          <Icon name="book" size={28} />
          <h2>{tr("arc.skills.arcSkills.makeYourNextTaskALittle")}</h2>
          <p>
            {query
              ? tr("arc.skills.arcSkills.noSkillsMatchYourSearch")
              : tr("arc.skills.arcSkills.importASkillMdToStart")}
          </p>
        </div>
      )}
    </section>
  );
}
function SkillCard({
  skill,
  resources,
  tr,
  onUse,
  onRemove,
}: {
  skill: Skill;
  resources: { providers: string[]; computer: boolean };
  tr: Props["tr"];
  onUse: () => void;
  onRemove: () => Promise<void>;
}) {
  const community = communityExperience(skill.id, tr),
    experience = workflowExperience(skill.id, tr),
    connected = experience
      ? experience.providers.length
        ? experience.providers.some((p) => resources.providers.includes(p))
        : resources.computer
      : false;
  const [content, setContent] = useState(""),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  async function load() {
    if (content || busy) return;
    setBusy(true);
    try {
      const data = await arcRequest<{ content: string }>("skills/" + encodeURIComponent(skill.id));
      setContent(data.content);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="arcSkillCard">
      <div className="arcSkillCardTop">
        <span>
          {skill.origin === "community" ? (
            <img src="/app-brands/github.svg" alt="" width={20} height={20} />
          ) : (
            <Icon name="book" />
          )}
        </span>
        <small>
          {skill.origin === "imported" ? tr("arc.skills.arcSkills.yourImport") : skill.owner}
        </small>
      </div>
      <h2>{community?.title || experience?.title || skill.name}</h2>
      <p>
        {community?.description ||
          experience?.result ||
          skill.description ||
          tr("arc.skills.arcSkills.reusableInstructionsForYourAgent")}
      </p>
      {skill.origin !== "imported" && (
        <p className="arcSkillRequirement" data-ready={resources.computer}>
          {resources.computer
            ? tr("arc.skills.arcSkills.computerConnectedPreparedAsNeeded")
            : tr("arc.skills.arcSkills.runsOnAnAuthorizedComputer")}
          <small>
            {skill.requires?.filter((value) => value !== "Connected computer").join(" · ")}
          </small>
        </p>
      )}
      {experience && (
        <p className="arcSkillRequirement" data-ready={connected}>
          {connected ? tr("arc.skills.arcSkills.connected") : tr("arc.skills.arcSkills.needs")}
          {experience.needs}
        </p>
      )}
      {skill.sourceUrl && (
        <a
          className="arcSkillSource"
          href={skill.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {skill.sourceUrl.startsWith("https://github.com/")
            ? tr("arc.skills.arcSkills.viewOnGithub")
            : tr("arc.skills.arcSkills.viewSource")}
          <Icon name="arrowUpRight" size={13} />
        </a>
      )}
      {skill.origin !== "imported" && (
        <div className="arcCommunityMeta">
          {skill.core && (
            <span className="arcSkillCore">{tr("arc.skills.arcSkills.coreVideoSkill")}</span>
          )}
          <span>
            {skill.origin === "builtin"
              ? tr("arc.skills.arcSkills.remoteArcOriginal")
              : skill.license}
          </span>
          {skill.origin === "builtin" && <span>v{skill.version}</span>}
          <span>
            {skill.resourceCount || tr("arc.skills.arcSkills.pinnedSource")}{" "}
            {skill.resourceCount ? tr("arc.skills.arcSkills.files") : ""}
          </span>
        </div>
      )}
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void load();
        }}
      >
        <summary>{tr("arc.skills.arcSkills.readInstructions")}</summary>
        {error ? (
          <button type="button" className="ghostButton" onClick={() => void load()}>
            {tr("arc.skills.arcSkills.retryLoading")}
          </button>
        ) : (
          <pre>{content || tr("arc.skills.arcSkills.loading")}</pre>
        )}
      </details>
      <footer>
        <button className="ghostButton" type="button" onClick={onUse}>
          {tr("arc.skills.arcSkills.startInChat")}
          <Icon name="arrowUpRight" size={14} />
        </button>
        {skill.origin === "imported" && (
          <button
            className="ghostButton"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onRemove().finally(() => setBusy(false));
            }}
            aria-label={tr("arc.skills.arcSkills.removeSkill") + ": " + skill.name}
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </footer>
    </article>
  );
}
