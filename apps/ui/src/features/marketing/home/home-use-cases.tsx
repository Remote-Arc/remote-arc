import { useEffect, useId, useRef, useState } from "react";
import { INSTALL_METHODS } from "../../../components/install-commands.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { aiClients } from "../../../lib/ai-clients.js";
import { useCopiedText } from "../../../hooks/marketing/use-copied-text.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import type { MessageKey } from "../../../locales/locale-catalog.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { InteractiveWorkDemo, type DemoScenario } from "./landing-interactive-demo.js";
import { FLEET_OFFLINE, FLEET_SIZE, FLEET_WARN, HOME_USE_CASES } from "./home-use-cases-data.js";
import "../../../styles/marketing/home/home-use-cases.css";

const key = (name: string) => ("marketing.home.homeUseCases." + name) as MessageKey;
const INSTALL = INSTALL_METHODS[0].command;

/** "Get Remote Arc", its menu of ways in, and the install command with a copy button. */
function GetStarted() {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, copy] = useCopiedText();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const href = (path: string) => localizedWebsiteHref(path, locale);
  return (
    <div className="homeUseCasesStart">
      <div className="homeUseCasesGet" ref={root}>
        <button
          type="button"
          className="homeUseCasesGetButton"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          {tr(key("getRemoteArc"))}
          <ProductIcon name="chevron" size={15} />
        </button>
        <code>{INSTALL}</code>
        <button
          type="button"
          className="homeUseCasesCopy"
          aria-label={tr(key("copyCommand"))}
          onClick={() => void copy("install", INSTALL)}
        >
          {copied ? tr(key("copied")) : <ProductIcon name="copy" size={15} />}
        </button>
        <div className="homeUseCasesMenu" id={menuId} hidden={!open}>
          <a href={href("/downloads")}>
            {tr(key("desktopAgent"))} <ProductIcon name="download" size={14} />
          </a>
          {aiClients.map((client) => (
            <a key={client.slug} href={href("/install/" + client.slug)}>
              {client.name} <ProductIcon name="arrowUpRight" size={14} />
            </a>
          ))}
          <a href={href("/remote-mcp")}>
            Remote MCP <ProductIcon name="arrowUpRight" size={14} />
          </a>
        </div>
      </div>
      <p>
        {tr(key("orReadThe"))} <a href={href("/docs")}>{tr(key("documentation"))}</a>
      </p>
    </div>
  );
}

/** The server room as a grid: one square per machine, coloured by its health. */
function FleetGrid() {
  const { tr } = useI18n();
  return (
    <div className="homeUseCasesFleet">
      <div className="homeUseCasesFleetGrid" aria-hidden="true">
        {Array.from({ length: FLEET_SIZE }, (_, index) => (
          <i
            key={index}
            data-state={FLEET_OFFLINE.has(index) ? "off" : FLEET_WARN.has(index) ? "warn" : "ok"}
            style={{ animationDelay: index * 5 + "ms" }}
          />
        ))}
      </div>
      <p className="homeUseCasesFleetLegend">
        <span data-state="ok">{tr(key("fleetLegendOk"))} · 123</span>
        <span data-state="warn">{tr(key("fleetLegendWarn"))} · 3</span>
        <span data-state="off">{tr(key("fleetLegendOff"))} · 2</span>
      </p>
    </div>
  );
}

/**
 * "Ask in chat": how to get started, then four example requests played in the
 * ChatGPT / Claude / Cursor demo. The notes under it describe each request and
 * choose it as well.
 */
export function HomeUseCases() {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const scenarios: DemoScenario[] = HOME_USE_CASES.map((item) => ({
    id: item.id,
    label: tr(item.label),
    request: tr(item.prompt),
    result: tr(item.reply),
    permission: tr(item.permission),
    link: "",
    script: {
      kind: item.kind,
      icons: [item.icon],
      href: item.href,
      attachment: item.id === "fleet" ? <FleetGrid /> : undefined,
      events: item.steps.map((step) => ({
        tool: step.tool,
        arguments: JSON.stringify(step.arguments),
        output: tr(step.output),
        duration: step.duration,
      })),
      progress: item.steps.map((step) => ({ working: tr(step.working), done: tr(step.output) })),
    },
  }));
  return (
    <div className="homeUseCases">
      <GetStarted />
      <div className="homeUseCasesStage">
        <InteractiveWorkDemo
          scenarios={scenarios}
          selected={selected}
          onSelect={setSelected}
          layout="stage"
        />
      </div>
      <ul className="homeUseCasesNotes">
        {HOME_USE_CASES.map((item, index) => (
          <li key={item.id} data-active={index === selected || undefined}>
            <button
              type="button"
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              <strong>
                {tr(item.title)}
                {item.enterprise ? <em>{tr(key("enterprise"))}</em> : null}
              </strong>
              <span>{tr(item.body)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
