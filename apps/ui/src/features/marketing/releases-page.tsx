import { useI18n } from "../../app/i18n.js";
import { releaseChinese } from "./release-locales.js";
import { type User } from "../../types/app-types.js";
import { PublicLayout } from "../../components/public-layout.js";

type ProductRelease = {
  version: string;
  date: string;
  status?: "release-candidate" | "released";
  title: string;
  summary: string;
  changes: string[];
};
declare const __REMOTEARC_RELEASES__: ProductRelease[];
const LEGACY_PRODUCT_RELEASES: ProductRelease[] = [
  {
    version: "0.3.14",
    date: "2026-09-29",
    status: "released",
    title: "Relay reconnect resilience",
    summary: "Made long-lived device connectivity recover more reliably after failed handshakes instead of giving up on the relay session.",
    changes: [
      "Keep reconnect attempts alive after WebSocket handshake failures.",
      "Hardened the background connection path used by remotelink.",
    ],
  },
  {
    version: "0.3.13",
    date: "2026-09-27",
    status: "released",
    title: "Self-repairing pairing and publishing",
    summary: "Reduced two operational failure modes: revoked devices can repair their pairing flow and release automation no longer depends on hard-coded CLI versions.",
    changes: [
      "Automatically re-pair a remotelink client when its saved device credential has been revoked.",
      "Made package/release version checks derive the current CLI version dynamically.",
    ],
  },
  {
    version: "0.3.12",
    date: "2026-09-27",
    status: "released",
    title: "Clearer AI grants and dashboard controls",
    summary: "Made the relationship between OAuth client grants, paired computers and device controls easier to understand and manage.",
    changes: [
      "Clarified AI-client grants independently from paired-device trust.",
      "Upgraded dashboard controls for day-to-day device administration.",
    ],
  },
  {
    version: "0.3.11",
    date: "2026-09-27",
    status: "released",
    title: "Policy-aware operations",
    summary: "Connected path-policy, undo and managed-process state more directly to the dashboard and live device connection.",
    changes: [
      "Extended path-policy and Local Undo status surfaced by connected devices.",
      "Improved managed background-process visibility and policy-capable connection selection.",
    ],
  },
  {
    version: "0.3.10",
    date: "2026-09-27",
    status: "released",
    title: "Protected directory listings",
    summary: "Sensitive-path policy stopped being only an operation-time guard: protected entries are also hidden from ordinary directory listings.",
    changes: [
      "Hide protected entries from directory-listing results.",
      "Reduce accidental disclosure before a later file operation is attempted.",
    ],
  },
  {
    version: "0.3.9",
    date: "2026-09-27",
    status: "released",
    title: "Path policy and Local Undo history",
    summary: "Introduced practical filesystem boundaries and user-visible recovery state for supported edits.",
    changes: [
      "Trusted Write Locations and sensitive-path policy for normal file tools.",
      "Local-only Undo history with conflict-safe restore semantics.",
    ],
  },
  {
    version: "0.3.8",
    date: "2026-09-27",
    status: "released",
    title: "Native execution core",
    summary: "Removed the Desktop Commander dependency and brought filesystem, process and safety behavior into Remote Arc's own execution core.",
    changes: [
      "Replaced Desktop Commander with Remote Arc's native Node/OS execution core.",
      "Removed the legacy external CLI path and refreshed trusted-publisher/architecture documentation.",
    ],
  },
  {
    version: "0.3.7",
    date: "2026-09-27",
    status: "released",
    title: "Free-tier global relay optimization",
    summary: "Reduced unnecessary Worker cost and request pressure while keeping the hosted relay globally reachable.",
    changes: [
      "Optimized static and live routing paths for Cloudflare's free-tier economics.",
      "Kept the outbound device relay architecture while reducing avoidable Worker work.",
    ],
  },
  {
    version: "0.3.6",
    date: "2026-09-27",
    status: "released",
    title: "Local Undo and Safety Guard",
    summary: "Added local recovery for supported edits and another defense-in-depth layer around catastrophic shell patterns.",
    changes: [
      "Local Undo snapshots for supported Remote Arc file edits.",
      "Safety Guard for a narrow set of catastrophic command patterns.",
      "Hardened OIDC-based package publishing.",
    ],
  },
  {
    version: "0.3.5",
    date: "2026-09-26",
    status: "released",
    title: "Safe-by-default device access",
    summary: "New device access began from a read-oriented baseline instead of assuming broad write or terminal authority.",
    changes: [
      "Safe access became the default permission posture.",
      "Production D1 binding and health fixes stabilized the hosted control plane.",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-09-26",
    status: "released",
    title: "Real security controls and edge protection",
    summary: "Turned the dashboard's security story into enforceable controls instead of descriptive settings.",
    changes: [
      "Added real per-device security controls and edge-side enforcement.",
      "Upgraded Overview, Devices, Connect AI and Security Center UX around those controls.",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-09-26",
    status: "released",
    title: "Separate website, dashboard and MCP surfaces",
    summary: "Split product marketing from the authenticated control plane and prepared the service for public MCP/plugin review.",
    changes: [
      "Separated the dashboard/MCP host from the public website.",
      "Refined onboarding, installation entry points and public-review readiness.",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-09-25",
    status: "released",
    title: "Observable CLI and trusted publishing",
    summary: "Made remotelink easier to diagnose and moved package publishing toward an auditable OIDC flow.",
    changes: [
      "Structured connection and tool logs in the CLI.",
      "Trusted-publishing workflow plus package metadata and source-license cleanup.",
      "Fixed pairing-log output.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-09-25",
    status: "released",
    title: "remotearc.app and product identity",
    summary: "Completed the public Remote Arc identity, domain migration and legal/plugin surface around the renamed product.",
    changes: [
      "Migrated public traffic and canonical branding to remotearc.app.",
      "Added plugin/MCP metadata, privacy, terms and support pages.",
      "Centralized Settings and per-device tool permissions.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-25",
    status: "released",
    title: "Remote Arc",
    summary: "The Remote Link prototype became Remote Arc, with the remotelink CLI/package becoming the stable installation entry.",
    changes: [
      "Rebranded Remote Link to Remote Arc across UI, CLI and MCP surfaces.",
      "Standardized the remotelink package and executable product flow.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-24",
    status: "released",
    title: "Hosted identity, pairing and OAuth",
    summary: "The prototype became a multi-user hosted control plane with explicit device identity and AI-client authorization.",
    changes: [
      "Google account/session authentication, browser-approved device pairing and per-device credentials.",
      "OAuth 2.1 authorization-code flow with PKCE and explicit consent for Remote MCP clients.",
      "Per-user Durable Object routing, device ownership/revocation checks and privacy-preserving audit metadata.",
      "10,000-call monthly hosted quota, bilingual product pages and the first full device dashboard.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-24",
    status: "released",
    title: "First end-to-end Remote Link",
    summary: "Established the original architecture: local agent, hosted relay, MCP adapter and a one-command path toward pairing a real computer.",
    changes: [
      "Initialized the monorepo, local MCP execution path, agent and Cloudflare relay.",
      "Added the first dashboard and one-command pairing CLI foundation.",
    ],
  },
];
const PRODUCT_RELEASES: ProductRelease[] = [
  ...__REMOTEARC_RELEASES__,
  ...LEGACY_PRODUCT_RELEASES,
];
export function ReleasesPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const latest = PRODUCT_RELEASES[0]!;

  return (
    <PublicLayout user={user}>
      <main className="releasesPage">
        <header className="articleHeader releaseHeader">
          <span className="eyebrow">{tr("RELEASES", "版本发布")}</span>
          <h1>{tr("Remote Arc release history", "Remote Arc 版本历史")}</h1>
          <p>{tr(
            "A version-by-version record of how Remote Arc evolved from a one-command remote MCP prototype into a persistent, policy-aware execution and agent control plane.",
            "按版本记录 Remote Arc 如何从一条命令即可连接的 Remote MCP 原型，演进为具备持久任务、权限策略与 Agent 控制面的产品。",
          )}</p>
          <div className="releaseLatestLine">
            <span>{tr("LATEST CLI", "最新 CLI")}</span>
            <strong>v{latest.version}</strong>
            <em>{latest.status === "release-candidate" ? tr("Release candidate", "候选发布") : tr("Published", "已发布")}</em>
            <time>{latest.date}</time>
          </div>
        </header>

        <section className="releaseIntro">
          <div>
            <strong>{tr("One product history", "一条完整产品历史")}</strong>
            <p>{tr(
              "This page stays on remotearc.app and combines CLI, relay, dashboard, security and product-surface milestones into the version in which they became part of the product.",
              "本页保留在 remotearc.app 内，把 CLI、Relay、Dashboard、安全能力和产品界面的重要升级归入真正形成产品能力的对应版本。",
            )}</p>
          </div>
          <div>
            <strong>{tr("Release status", "版本状态")}</strong>
            <p>{tr(
              `The latest published CLI is remotelink ${latest.version}. Task availability also depends on your plan, relay configuration and device permissions; a website preview does not execute work.`,
              `最新已发布的 CLI 是 remotelink ${latest.version}。任务可用性还取决于套餐、Relay 配置与设备权限；网站预览不会执行任务。`,
            )}</p>
          </div>
        </section>

        <div className="releaseTimeline">
          {PRODUCT_RELEASES.map((release, index) => (
            <article className={"releaseEntry " + (index === 0 ? "latest" : "")} key={release.version} id={"v" + release.version.replaceAll(".", "-")}>
              <aside className="releaseVersionRail">
                <span className="releaseRailDot" />
                <strong>v{release.version}</strong>
                <time>{release.date}</time>
                <span className={"releaseState " + (release.status || "released")}>
                  {release.status === "release-candidate"
                    ? tr("Release candidate", "候选版本")
                    : tr("Released", "已发布")}
                </span>
              </aside>
              <div className="releaseBody">
                <h2>{locale === "zh" ? (releaseChinese[release.version]?.title ?? release.title) : release.title}</h2>
                <p className="releaseSummary">{locale === "zh" ? (releaseChinese[release.version]?.summary ?? release.summary) : release.summary}</p>
                {locale === "zh" ? (
                  <details className="releaseOriginalNotes">
                    <summary>{tr("Original technical change notes", "展开英文原始技术变更明细")}</summary>
                    <ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                  </details>
                ) : (
                  <ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </PublicLayout>
  );
}
