import { useRef, useState } from "react";
import { INSTALL_METHODS } from "../../../components/install-commands.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { useAgentDownload } from "../../../hooks/marketing/use-agent-download.js";
import { useCopiedText } from "../../../hooks/marketing/use-copied-text.js";
import { useScrollProgress } from "../../../hooks/marketing/use-scroll-progress.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { AGENT_PLATFORM_NAMES, agentDownloadPath } from "../../../lib/agent-download.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { HomeArcHorizon } from "./home-arc-horizon.js";
import "../../../styles/marketing/home/home-hero.css";

/** The install command on one line under the buttons: npx or curl, copied with one click. */
function HeroCommand() {
  const { tr } = useI18n();
  const [copied, copy] = useCopiedText();
  const [selected, setSelected] = useState(0);
  const method = INSTALL_METHODS[selected]!;
  return (
    <div className="heroCommand">
      <div
        className="heroCommandTabs"
        role="tablist"
        aria-label={tr("components.installCommands.installationMethod")}
      >
        {INSTALL_METHODS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
              event.preventDefault();
              const next = (index + 1) % INSTALL_METHODS.length;
              setSelected(next);
              (
                event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
              )?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <code>
        <span aria-hidden="true">$</span> {method.command}
      </code>
      <button
        type="button"
        className="heroCommandCopy"
        onClick={() => void copy(method.id, method.command)}
        aria-label={tr("components.installCommands.copyCommands", { label: method.label })}
      >
        <ProductIcon name={copied === method.id ? "check" : "copy"} size={14} />
      </button>
      <span className="heroCommandStatus" role="status">
        {copied === method.id ? tr("components.installCommands.copied") : ""}
      </span>
    </div>
  );
}

/** The hero's words: product label, two-tone headline, one line and the ways to start. */
export function HomeHeroCopy({ connectHref }: { connectHref: string }) {
  const { tr, locale } = useI18n();
  const agentTarget = useAgentDownload();
  return (
    <div className="heroCopy">
      <span className="eyebrow heroProductLabel">
        <i />
        REMOTE ARC · {tr("marketing.home.landingContent.aiInfrastructure")}
      </span>
      <h1 className="heroHeadline">
        {tr("marketing.home.hero.titleLead")} <br />
        <em>{tr("marketing.home.hero.titleAccent")}</em>
      </h1>
      <p>{tr("marketing.home.hero.subtitle")}</p>
      <div className="landingActions">
        <a className="primaryButton marketingPrimary" href={connectHref}>
          {tr("marketing.home.landingContent.connectYourAi")}
          <ProductIcon name="arrowUpRight" size={16} />
        </a>
        <a
          className="marketingSecondary heroDownloadAgent"
          href={
            agentTarget
              ? agentDownloadPath(agentTarget)
              : localizedWebsiteHref("/downloads", locale)
          }
          data-platform={agentTarget?.platform}
        >
          {agentTarget
            ? tr("marketing.home.landingContent.downloadForPlatform", {
                platform: AGENT_PLATFORM_NAMES[agentTarget.platform],
              })
            : tr("marketing.home.landingContent.downloadAgent")}
          <ProductIcon name="download" size={15} />
        </a>
      </div>
      <HeroCommand />
      {/* For visitors without an AI of their own: Arc, which also keeps working while they are away. */}
      <a className="heroArcAction" href={localizedWebsiteHref("/arc", locale)}>
        <img src="/remote-arc.svg" alt="" width={18} height={18} />
        <span>
          <b>{tr("marketing.home.hero.arcLead")}</b> {tr("marketing.home.hero.arcAction")}
        </span>
        <ProductIcon name="arrowUpRight" size={15} />
      </a>
    </div>
  );
}

/**
 * The home hero: centred copy above the arc. Scrolling down grows the arc
 * upward while the words rise and fade; scrolling back reverses both.
 */
export function HomeHero({ connectHref }: { connectHref: string }) {
  const hero = useRef<HTMLElement>(null);
  const progress = useScrollProgress(hero);
  return (
    <section className="homeHero" ref={hero}>
      <HomeHeroCopy connectHref={connectHref} />
      <HomeArcHorizon progress={progress} />
    </section>
  );
}
