import { CONNECT_FAIR_USE, CONNECT_FREE_OVERFLOW } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
import type { PlatformCatalog } from "../../lib/use-platform-catalog.js";
import { isConnectOnlyPlan } from "../billing/arc-billing-client.js";
export function ArcPublicPricing({
  catalog,
  startHref,
  usageHref,
}: {
  catalog: PlatformCatalog;
  startHref: string;
  usageHref: string;
}) {
  const { tr, locale } = useI18n(),
    billing = "https://agent.remotearc.app/checkout";
  return (
    <main className="pricingContent">
      <header className="pricingIntro">
        <span className="eyebrow">{tr("CLEAR PLANS. BOUNDED USAGE.", "清晰套餐 · 有界用量")}</span>
        <h1>{tr("A personal agent. A plan that fits.", "你的个人智能体，适合你的套餐。")}</h1>
        <p>
          {tr(
            "Connect your existing AI for free. Choose Arc to coordinate work across apps and your own computers. No model API key required.",
            "免费连接已有的 AI。选择 Arc，协调应用与自己电脑上的工作。无需模型 API Key。",
          )}
        </p>
      </header>
      <section className="arcPricingTrial">
        <div>
          <span className="eyebrow">ARC / {catalog.trial.days}-DAY TRIAL</span>
          <h2>{tr("Try your personal agent.", "试试你的个人智能体。")}</h2>
          <p>
            {tr(
              catalog.trial.days +
                " days. " +
                catalog.trial.credits +
                " Credits. Activate when you are ready. No card required.",
              catalog.trial.days +
                " 天，" +
                catalog.trial.credits +
                " Credits。准备好后再激活，无需信用卡。",
            )}
            {tr(
              " Auto is included. Named models require Plus or Pro.",
              " 包含 Auto；手动选择模型需要 Plus 或 Pro。",
            )}
          </p>
        </div>
        <a className="primaryButton" href="https://agent.remotearc.app/dashboard/arc/chat">
          {tr("Start free trial", "开始免费试用")} ↗
        </a>
      </section>
      <section className="pricingPlans pricingPlans--saas">
        {[
          {
            key: "own",
            title: tr("Bring your own AI", "用你自己的 AI"),
            note: tr(
              "Connect ChatGPT, Claude or Codex to your computers.",
              "把 ChatGPT、Claude 或 Codex 连接到你的电脑。",
            ),
            plans: catalog.plans.filter((p) => p.id === "free" || isConnectOnlyPlan(p)),
          },
          {
            key: "arc",
            title: tr("Arc’s own agent", "Arc 智能体"),
            note: tr(
              "Arc runs the AI for you, with model Credits included.",
              "由 Arc 为你运行 AI，含模型 Credits。",
            ),
            plans: catalog.plans.filter((p) => p.id !== "free" && !isConnectOnlyPlan(p)),
          },
        ].map((group) => (
          <div className="planGroup" key={group.key}>
            <header className="planGroupHeader">
              <h2>{group.title}</h2>
              <p>{group.note}</p>
            </header>
            <div className="planGroupCards">
              {group.plans.map((p) => {
                const connect = isConnectOnlyPlan(p),
                  yearly = connect && p.yearlyPriceCents ? p.yearlyPriceCents : null,
                  checkout = billing + "?product=" + encodeURIComponent(p.id);
                return (
                  <article
                    className={
                      "planCard " +
                      (p.id === "free" ? "freePlan" : connect ? "featuredPlan" : "arcPlan")
                    }
                    key={p.id}
                  >
                    {connect && <span className="planRibbon">{tr("RECOMMENDED", "推荐")}</span>}
                    <div className="planHeader">
                      <span>{p.label.toUpperCase()}</span>
                      {!connect && p.id !== "free" && (
                        <span className="plusBadge">ARC + CONNECT</span>
                      )}
                    </div>
                    <div className="hostedPrice">
                      <strong>
                        {yearly ? (
                          <>
                            US${Math.floor(yearly / 1200)}
                            <small>.{(yearly / 1200).toFixed(2).split(".")[1]}</small>
                          </>
                        ) : (
                          "US$" + p.monthlyPriceCents / 100
                        )}
                      </strong>
                      <span>/ {tr("month", "月")}</span>
                    </div>
                    {yearly ? (
                      <>
                        <p className="hostedPriceNote">
                          {tr(`Billed yearly at US$${yearly / 100}`, `按年付费 US$${yearly / 100}`)}{" "}
                          <span className="planSaveTag">
                            {tr("Save ", "省 ") +
                              Math.round((1 - yearly / (p.monthlyPriceCents * 12)) * 100) +
                              "%"}
                          </span>
                        </p>
                        <p className="hostedPriceNote">
                          {tr(
                            `or US$${p.monthlyPriceCents / 100} month to month`,
                            `或按月付费 US$${p.monthlyPriceCents / 100}`,
                          )}
                        </p>
                      </>
                    ) : connect ? (
                      <p className="hostedPriceNote">
                        {tr(
                          `About US$${(p.monthlyPriceCents / 3000).toFixed(2)} a day`,
                          `约每天 US$${(p.monthlyPriceCents / 3000).toFixed(2)}`,
                        )}
                      </p>
                    ) : null}
                    <p className="planDescription">
                      {p.id === "free"
                        ? tr("Your AI, connected to your world.", "让已有的 AI 连接你的世界。")
                        : connect
                          ? tr(
                              "Your own AI on every computer, at full speed all month.",
                              "用你自己的 AI 连接每一台电脑，整月全速运行。",
                            )
                          : p.label === "Plus"
                            ? tr(
                                "Arc handles your everyday work, with Credits included.",
                                "由 Arc 处理日常工作，含模型 Credits。",
                              )
                            : tr(
                                "More Credits and capacity for ongoing work.",
                                "更多 Credits 与容量，适合持续工作。",
                              )}
                    </p>
                    <ul className="planIncluded">
                      {(connect
                        ? [
                            tr(
                              "Your agents at full speed all month · no call cap, no slow lane",
                              "agent 整月全速运行 · 不限调用次数，没有慢速通道",
                            ),
                            tr("Unlimited computers and file transfer", "不限电脑数量与文件传输"),
                            tr(
                              "Terminal, files, browser, Fleet and connected Apps",
                              "终端、文件、浏览器、Fleet 与已连接应用",
                            ),
                            tr(
                              "Works with your own ChatGPT, Claude or Codex",
                              "使用你自己的 ChatGPT、Claude 或 Codex",
                            ),
                          ]
                        : p.id === "free"
                          ? [
                              (catalog.connectFreeCalls === null
                                ? tr("Unlimited", "无限")
                                : catalog.connectFreeCalls.toLocaleString()) +
                                tr(" Connect calls / month", " 次 Connect 调用 / 月"),
                              tr(
                                `Run out? A one-time ${CONNECT_FREE_OVERFLOW.trialDays}-day Unlimited trial, then a ${CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute}-calls-a-minute slow lane. Never cut off`,
                                `额度用完？先送一次 ${CONNECT_FREE_OVERFLOW.trialDays} 天 Unlimited 试用，之后进入每分钟 ${CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute} 次的慢速通道，不会断`,
                              ),
                              tr("Up to 2 computers", "最多连接 2 台电脑"),
                              tr("2 GB file transfer / month", "每月 2 GB 文件传输"),
                              tr("Device permissions and local Undo", "设备权限与本地撤销"),
                            ]
                          : [
                              p.monthlyCredits.toLocaleString() +
                                tr(" Credits / month", " Credits / 月"),
                              tr("All configured premium models", "全部已配置的高级模型"),
                              tr("One-off and recurring tasks", "一次性与重复任务"),
                              p.concurrentRuns + tr(" concurrent runs", " 个并行工作"),
                              tr("Up to ", "单次最长 ") +
                                p.maxSeconds / 60 +
                                tr(" minutes per run", " 分钟"),
                              (p.id === "arc-plus-v1"
                                ? 10
                                : (p.deviceLimit ?? tr("Unlimited", "无限"))) +
                                tr(" connected computers", " 台连接电脑"),
                              p.connectToolCalls === null
                                ? tr("Unlimited Connect calls", "无限 Connect 调用")
                                : p.connectToolCalls.toLocaleString() +
                                  tr(" Connect calls / month", " 次 Connect 调用 / 月"),
                            ]
                      ).map((item) => (
                        <li key={item}>
                          <span aria-hidden="true">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="planActions">
                      <a
                        className={connect ? "primaryButton" : "ghostButton"}
                        href={
                          p.id === "free"
                            ? startHref
                            : checkout +
                              (yearly && catalog.billingAvailable ? "&interval=year" : "")
                        }
                      >
                        {p.id === "free"
                          ? tr("Start free", "免费开始")
                          : !catalog.billingAvailable
                            ? tr("View billing availability", "查看付费开放状态")
                            : yearly
                              ? tr("Choose yearly", "选择按年付费")
                              : tr("Choose " + p.label, "选择 " + p.label)}{" "}
                        →
                      </a>
                      {yearly && catalog.billingAvailable ? (
                        <a className="planAltLink" href={checkout}>
                          {tr("Or pay monthly", "或按月付费")} →
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      <p className="pricingFinePrint">
        {tr(
          `Connect Unlimited follows published fair-use rate limits: up to ${CONNECT_FAIR_USE.computerRegistrationsPerDay} new computers a day, and each computer runs within its own capacity. It has no monthly Credits; Arc’s own agent needs Plus or Pro after its free trial.`,
          `Connect Unlimited 遵守公开的合理使用速率限制：每天最多新增 ${CONNECT_FAIR_USE.computerRegistrationsPerDay} 台电脑，运行并发取决于每台电脑自身容量。它不含月度 Credits；Arc 智能体的免费试用结束后需要 Plus 或 Pro。`,
        )}
      </p>
      <section className="pricingEnterprise" aria-label="Enterprise">
        <div>
          <span className="planHeader">ENTERPRISE</span>
          <strong>{tr("Let’s talk", "联系我们")}</strong>
          <p>
            {tr(
              "Custom capacity, deployment, support and billing, with agreed usage budgets.",
              "定制容量、部署、支持与账单，并约定用量预算。",
            )}
          </p>
        </div>
        <a
          className="ghostButton"
          href={(locale === "zh" ? "/zh" : "") + "/support?topic=enterprise"}
        >
          {tr("Contact us", "联系团队")} →
        </a>
      </section>
      <section className="pricingMetering">
        <header>
          <span className="eyebrow">{tr("YOUR USAGE, EXPLAINED", "清楚了解用量")}</span>
          <h2>{tr("More work, without surprise bills.", "完成更多工作，费用清清楚楚。")}</h2>
        </header>
        <div className="meteringGrid">
          <article>
            <span>01</span>
            <h3>{tr("Model Credits", "模型 Credits")}</h3>
            <p>
              {tr(
                "Auto prioritizes low cost. Advanced models consume Credits at their rated token prices, including reasoning and cache usage. Every agent step counts.",
                "Auto 优先控制成本，高级模型按各自 token 价格消耗 Credits，包含推理与缓存用量；每个智能体步骤都会计量。",
              )}
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>{tr("Connect calls", "Connect 调用")}</h3>
            <p>
              {tr(
                "Connect allowance is separate from model Credits and follows your saved plan terms. When Free runs out, calls are paced, not stopped. Rate limits and provider limits still apply.",
                "Connect 额度独立于模型 Credits，按已保存的套餐条款执行。Free 额度用完后调用会降速，而不是中断。仍遵守速率与供应商限制。",
              )}
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>{tr("Optional top-ups", "按需充值")}</h3>
            <p>
              {catalog.topups[0]!.credits} Credits / ${catalog.topups[0]!.priceCents / 100}.{" "}
              {tr(
                "No automatic overage charges. An active paid plan is required. Provider account charges, such as Runway generation, remain separate.",
                "不会自动收取超额费用，使用充值额度需有有效付费套餐；Runway 生成等第三方账号费用单独计算。",
              )}
            </p>
          </article>
        </div>
        <p>
          {tr(
            "Monthly Credits expire at the billing-period end. Purchased top-ups do not expire. Prices are in USD, excluding applicable taxes.",
            "套餐月度 Credits 在账期结束时到期，充值额度不设到期日。价格以美元计，不含适用税费。",
          )}
        </p>
        <a className="pricingUsageLink" href={usageHref}>
          {tr("Check your usage", "查看用量")} →
        </a>
      </section>
    </main>
  );
}
