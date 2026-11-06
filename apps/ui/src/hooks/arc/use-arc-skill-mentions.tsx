import type { Translate } from "../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { communityExperience } from "../../features/arc/skills/arc-community-experience.js";
import { ProductIcon } from "../../components/product-icon.js";
import { workflowExperience } from "../../features/arc/skills/arc-skill-experience.js";
import type { ArcEmployeeAvatar } from "@remotearc/protocol";
import { ArcReferenceIcon } from "../../features/arc/composer/arc-reference-icon.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { arcRequest } from "./use-arc-chat.js";
export type ArcMention = {
  kind: "skill" | "app" | "employee";
  avatar?: ArcEmployeeAvatar;
  id: string;
  name: string;
  description?: string;
  provider?: string;
};
type Tr = Translate;
export function skillMentionAt(text: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]{0,60})$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1]!.length - 1, end: caret, query: match[1]! } : null;
}
/** References stay structured. Labels are display data, never pasted instructions or authorization. */
export function useArcSkillMentions(
  accountId: string,
  draft: string,
  setDraft: (value: string) => void,
  editor: RefObject<HTMLTextAreaElement | null>,
  tr: Tr,
  initial: ArcMention[] = [],
  resourceRevision = "",
) {
  const [kind, setKind] = useState<"all" | "employee" | "app" | "skill">("all");
  const id = useId(),
    [open, setOpen] = useState(false),
    [items, setItems] = useState<ArcMention[]>([]),
    [selected, setSelected] = useState<ArcMention[]>(initial),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const searchField = useRef<HTMLInputElement>(null);
  const range = useRef<ReturnType<typeof skillMentionAt>>(null);
  useEffect(() => {
    if (!open) return;
    const composer = editor.current?.closest<HTMLElement>(".arcChatComposer");
    if (!composer) return;
    const position = () => {
      const boundary =
          composer
            .closest(".arcChatShell")
            ?.querySelector(".arcChatScroll")
            ?.getBoundingClientRect().top || 0,
        space = Math.floor(composer.getBoundingClientRect().top - boundary - 10);
      composer.style.setProperty("--arc-reference-space", Math.max(180, space) + "px");
      composer.toggleAttribute("data-inline-references", space < 180);
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      composer.style.removeProperty("--arc-reference-space");
      composer.removeAttribute("data-inline-references");
    };
  }, [open, editor]);
  useEffect(() => {
    setItems([]);
    setSelected(initial);
    setOpen(false);
  }, [accountId]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void Promise.allSettled([
      arcRequest<{ skills: Omit<ArcMention, "kind">[] }>("skills", undefined, controller.signal),
      fetch("/api/apps", {
        credentials: "same-origin",
        signal: controller.signal,
        headers: { accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) throw Error("APPS_UNAVAILABLE");
        return response.json().then(canonicalErrorEnvelope) as Promise<{
          apps: { provider: string; name: string }[];
          connections: { id: string; provider: string; status: string; accountLabel?: string }[];
        }>;
      }),
      arcRequest<{
        employees: {
          id: string;
          name: string;
          responsibility: string;
          avatar: ArcEmployeeAvatar;
          status: string;
        }[];
      }>("employees", undefined, controller.signal),
    ])
      .then(([skills, apps, employees]) => {
        if (controller.signal.aborted) return;
        const next: ArcMention[] = [];
        if (skills.status === "fulfilled")
          next.push(
            ...skills.value.skills.map((skill) => {
              const community = communityExperience(skill.id, tr),
                experience = workflowExperience(skill.id, tr);
              return {
                ...skill,
                name: community?.title || experience?.title || skill.name,
                description: community?.description || experience?.result || skill.description,
                kind: "skill" as const,
              };
            }),
          );
        if (apps.status === "fulfilled") {
          const names = new Map(apps.value.apps.map((app) => [app.provider, app.name]));
          next.push(
            ...apps.value.connections
              .filter((connection) => connection.status === "active")
              .map((connection) => ({
                kind: "app" as const,
                id: connection.id,
                name: names.get(connection.provider) || connection.provider,
                description: connection.accountLabel || "",
                provider: connection.provider,
              })),
          );
        }
        if (employees.status === "fulfilled")
          next.push(
            ...employees.value.employees
              .filter((employee) => employee.status === "active")
              .map((employee) => ({
                kind: "employee" as const,
                id: employee.id,
                name: employee.name,
                description: employee.responsibility,
                avatar: employee.avatar,
              })),
          );
        setItems(next);
        setError([employees, skills, apps].some((result) => result.status === "rejected"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, accountId, retry, resourceRevision]);
  const key = (item: ArcMention) => item.kind + ":" + item.id;
  const atLimit = (item: ArcMention) =>
    selected.length >= 8 ||
    selected.filter((value) => value.kind === item.kind).length >=
      (item.kind === "app" ? 5 : item.kind === "employee" ? 8 : 3);
  const visible = items
    .filter(
      (item) =>
        (kind === "all" || kind === item.kind) &&
        !selected.some((value) => key(value) === key(item)) &&
        !atLimit(item) &&
        [item.name, item.description, item.provider]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 30);
  const choose = (item: ArcMention) => {
    if (atLimit(item)) return;
    setSelected((values) =>
      values.some((value) => key(value) === key(item)) ? values : [...values, item],
    );
    setOpen(false);
    const token = range.current;
    setDraft(token ? draft.slice(0, token.start) + draft.slice(token.end) : draft);
    range.current = null;
    requestAnimationFrame(() => {
      editor.current?.focus();
      if (token) editor.current?.setSelectionRange(token.start, token.start);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((value) =>
        Math.max(0, Math.min(visible.length - 1, value + (event.key === "ArrowDown" ? 1 : -1))),
      );
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (visible[index]) choose(visible[index]!);
      return true;
    }
    return false;
  };
  const listId = id + "-references",
    activeId = visible[index] ? id + "-" + index : undefined;
  useEffect(() => {
    if (typeof location === "undefined") return;
    const employeeId = new URLSearchParams(location.search).get("teammate");
    if (!employeeId || !/^[-\w]{1,100}$/.test(employeeId)) return;
    const controller = new AbortController();
    void arcRequest<{
      employee: {
        id: string;
        name: string;
        responsibility: string;
        avatar: ArcEmployeeAvatar;
        status: string;
      };
    }>("employees/" + encodeURIComponent(employeeId), undefined, controller.signal)
      .then(({ employee }) => {
        if (!controller.signal.aborted && employee.status === "active")
          setSelected((values) =>
            values.some((v) => v.kind === "employee" && v.id === employee.id)
              ? values
              : [
                  ...values,
                  {
                    kind: "employee",
                    id: employee.id,
                    name: employee.name,
                    description: employee.responsibility,
                    avatar: employee.avatar,
                  },
                ],
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [accountId]);
  return {
    selected,
    openFor: (next: "employee" | "app" | "skill") => {
      range.current = null;
      setKind(next);
      setQuery("");
      setIndex(0);
      setOpen(true);
      requestAnimationFrame(() => searchField.current?.focus());
    },
    clear: () => {
      setSelected([]);
      setOpen(false);
    },
    consume: (submitted: ArcMention[]) =>
      setSelected((values) => values.filter((value) => !submitted.includes(value))),
    onKeyDown,
    inputProps: {
      role: "combobox",
      "aria-haspopup": "listbox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": open,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open ? activeId : undefined,
    },
    onChange: (text: string, caret: number) => {
      setDraft(text);
      range.current = skillMentionAt(text, caret);
      setQuery(range.current?.query || "");
      setIndex(0);
      setKind("all");
      setOpen(Boolean(range.current) && selected.length < 8);
    },
    button: (
      <button
        type="button"
        disabled={selected.length >= 8}
        title={tr("hooks.arc.useArcSkillMentions.specifyAnAgentOrContextOptional")}
        aria-label={tr("hooks.arc.useArcSkillMentions.mentionAnAgentAppOrWorkflow")}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          range.current = null;
          setKind("all");
          setQuery("");
          setIndex(0);
          setOpen((value) => !value);
        }}
      >
        @
      </button>
    ),
    chips: selected.length > 0 && (
      <div className="arcMentionChips">
        {selected.map((item) => (
          <span
            className="arcContextChip"
            key={key(item)}
            data-kind={item.kind}
            title={item.description}
          >
            <ArcReferenceIcon item={item} /> <span className="arcReferenceName">{item.name}</span>
            <button
              className="arcReferenceRemove"
              type="button"
              aria-label={tr("hooks.arc.useArcSkillMentions.removeReference") + ": " + item.name}
              onClick={() =>
                setSelected((values) => values.filter((value) => key(value) !== key(item)))
              }
            >
              <ProductIcon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
    ),
    menu: open && (
      <div className="arcSkillMentionMenu">
        <label>
          {tr("hooks.arc.useArcSkillMentions.addContext")}
          <input
            ref={searchField}
            type="search"
            value={query}
            placeholder={tr("hooks.arc.useArcSkillMentions.findAnAgentAppOrWorkflow")}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            aria-controls={listId}
            aria-activedescendant={activeId}
          />
        </label>
        {loading ? (
          <WorkspaceLoading
            label={tr("hooks.arc.useArcSkillMentions.loadingReferences")}
            variant="compact"
          />
        ) : (
          <>
            {error && (
              <p role="status">
                {tr("hooks.arc.useArcSkillMentions.someReferencesCouldNotLoad")}{" "}
                <button type="button" onClick={() => setRetry((value) => value + 1)}>
                  {tr("hooks.arc.useArcSkillMentions.retry")}
                </button>
              </p>
            )}
            <div
              className="arcMentionKinds"
              role="group"
              aria-label={tr("hooks.arc.useArcSkillMentions.referenceType")}
            >
              {(["all", "employee", "app", "skill"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setIndex(0);
                  }}
                >
                  {value === "all"
                    ? tr("hooks.arc.useArcSkillMentions.all")
                    : value === "employee"
                      ? tr("hooks.arc.useArcSkillMentions.agents")
                      : value === "app"
                        ? tr("hooks.arc.useArcSkillMentions.apps")
                        : tr("hooks.arc.useArcSkillMentions.workflows")}
                </button>
              ))}
            </div>
            <div
              id={listId}
              role="listbox"
              aria-label={tr("hooks.arc.useArcSkillMentions.agentsAppsAndWorkflows")}
            >
              {visible.map((item, i) => (
                <button
                  id={id + "-" + i}
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  key={key(item)}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(item)}
                >
                  <ArcReferenceIcon item={item} />
                  <strong>
                    {item.name}{" "}
                    <small>
                      {item.kind === "employee"
                        ? tr("hooks.arc.useArcSkillMentions.agent")
                        : item.kind === "app"
                          ? tr("hooks.arc.useArcSkillMentions.app")
                          : tr("hooks.arc.useArcSkillMentions.workflow")}
                    </small>
                  </strong>
                  <small>{item.description}</small>
                </button>
              ))}
              {!visible.length && (
                <p>{tr("hooks.arc.useArcSkillMentions.noMatchesConnectAnAppOr")}</p>
              )}
            </div>
          </>
        )}
        <footer>
          {tr("hooks.arc.useArcSkillMentions.optionalContextForThisRequest")}
          <button type="button" onClick={() => setOpen(false)}>
            {tr("hooks.arc.useArcSkillMentions.close")}
          </button>
        </footer>
      </div>
    ),
  };
}
