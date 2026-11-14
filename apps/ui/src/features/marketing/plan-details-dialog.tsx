import { useEffect, useId, useRef, useState } from "react";
import { CONNECT_FREE_OVERFLOW, FREE_BINARY_BYTES_PER_MONTH } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import type { CatalogPlan, PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import type { Translate } from "../../locales/locale-catalog.js";
import { planIncludesArc, transferSize } from "../billing/arc-billing-client.js";
import { approxTaskCount } from "./plan-copy.js";
import "../../styles/marketing/plan-details.css";

type DetailRow = { key: string; label: string; value: string; note?: string };
type DetailSection = { key: string; title: string; rows: DetailRow[] };

const count = (value: number) => value.toLocaleString();

/** Every published term of one plan, read from the live catalog. A term the
 * catalog does not send is left out rather than guessed. */
export function planDetailSections(
  plan: CatalogPlan,
  catalog: PlatformCatalog,
  tr: Translate,
): DetailSection[] {
  const arc = planIncludesArc(plan),
    topup = catalog.topups[0],
    perMonth = (value: number) => tr("marketing.planDetails.perMonth", { value: count(value) }),
    upTo = (value: number) => tr("marketing.planDetails.upTo", { value: count(value) }),
    unlimited = tr("marketing.planDetails.unlimited"),
    notIncluded = tr("marketing.planDetails.notIncluded");
  const usage: DetailRow[] = [
    {
      key: "own-ai",
      label: tr("marketing.planDetails.ownAi"),
      value: tr("marketing.planDetails.included"),
    },
    {
      key: "connect-calls",
      label: tr("marketing.planDetails.connectCalls"),
      value:
        plan.connectToolCalls === null
          ? tr("marketing.planDetails.unlimitedFairUse")
          : perMonth(plan.connectToolCalls),
      ...(plan.id === "free" && plan.connectToolCalls !== null
        ? {
            note: tr("marketing.arcPublicPricing.runOutAOneTimeDay", {
              trialDays: CONNECT_FREE_OVERFLOW.trialDays,
              slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
            }),
          }
        : {}),
    },
    {
      key: "credits",
      label: tr("marketing.planDetails.arcCredits"),
      value: arc
        ? tr("marketing.planDetails.creditsPerMonthAboutTasks", {
            value: count(plan.monthlyCredits),
            tasks: count(approxTaskCount(plan.monthlyCredits)),
          })
        : notIncluded,
      ...(arc ? { note: tr("marketing.planDetails.creditsExpire") } : {}),
    },
    {
      key: "models",
      label: tr("marketing.planDetails.hostedModels"),
      value: plan.allHostedModels ? tr("marketing.planDetails.autoAndNamedModels") : notIncluded,
    },
  ];
  if (arc && topup)
    usage.push({
      key: "topups",
      label: tr("marketing.planDetails.topUps"),
      value: tr("marketing.planDetails.topUpPrice", {
        credits: count(topup.credits),
        price: topup.priceCents / 100,
      }),
      note: tr("marketing.planDetails.topUpsNeverExpire"),
    });
  const computers: DetailRow[] = [
    {
      key: "computers",
      label: tr("marketing.planDetails.computers"),
      value: plan.deviceLimit === null ? unlimited : upTo(plan.deviceLimit),
    },
    {
      key: "transfer",
      label: tr("marketing.planDetails.fileTransfer"),
      value:
        plan.id === "free"
          ? tr("marketing.planDetails.perMonth", {
              value: transferSize(FREE_BINARY_BYTES_PER_MONTH),
            })
          : unlimited,
    },
  ];
  if (plan.connectionLimit != null)
    computers.push({
      key: "apps",
      label: tr("marketing.planDetails.appConnections"),
      value: upTo(plan.connectionLimit),
    });
  const runs: DetailRow[] = [
    {
      key: "concurrent",
      label: tr("marketing.planDetails.concurrentRuns"),
      value: count(plan.concurrentRuns),
    },
  ];
  if (plan.routines != null)
    runs.push({
      key: "routines",
      label: tr("marketing.planDetails.routines"),
      value: plan.routines > 0 ? upTo(plan.routines) : notIncluded,
    });
  runs.push({
    key: "time",
    label: tr("marketing.planDetails.timePerRun"),
    value:
      plan.maxSeconds % 60 === 0
        ? tr("marketing.planDetails.minutes", { value: count(plan.maxSeconds / 60) })
        : tr("marketing.planDetails.seconds", { value: count(plan.maxSeconds) }),
  });
  if (plan.maxSteps != null)
    runs.push({
      key: "steps",
      label: tr("marketing.planDetails.stepsPerRun"),
      value: upTo(plan.maxSteps),
    });
  if (plan.maxTokens != null)
    runs.push({
      key: "tokens",
      label: tr("marketing.planDetails.tokensPerRun"),
      value: upTo(plan.maxTokens),
    });
  return [
    { key: "usage", title: tr("marketing.planDetails.usageAndModels"), rows: usage },
    { key: "computers", title: tr("marketing.planDetails.computersAndApps"), rows: computers },
    { key: "runs", title: tr("marketing.planDetails.arcTaskLimits"), rows: runs },
  ];
}

function priceSummary(plan: CatalogPlan, tr: Translate) {
  const monthly = plan.monthlyPriceCents / 100;
  if (plan.monthlyPriceCents === 0) return tr("marketing.planDetails.freeForever");
  return plan.yearlyPriceCents
    ? tr("marketing.planDetails.yearlyOrMonthly", {
        yearly: plan.yearlyPriceCents / 100,
        monthly,
      })
    : tr("marketing.planDetails.monthlyPrice", { monthly });
}

/** The card's "See full plan details" button and the dialog it opens. */
export function PlanDetails({ plan, catalog }: { plan: CatalogPlan; catalog: PlatformCatalog }) {
  const { tr } = useI18n(),
    [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (!element.open) element.showModal();
    // React's autoFocus runs before showModal(), so move focus in once it is open.
    closeButton.current?.focus();
    return () => {
      if (element.open) element.close();
      // The page is inert while the dialog is modal, so focus can return only now.
      trigger.current?.focus();
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="planDetailsButton"
        aria-haspopup="dialog"
        aria-label={tr("marketing.planDetails.openFor", { label: plan.label })}
        onClick={() => setOpen(true)}
      >
        {tr("marketing.planDetails.open")}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          className="planDetailsDialog"
          aria-labelledby={titleId}
          // Escape closes a modal dialog natively; keep React state in step.
          onClose={close}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          // A click on the dialog element itself is a click on the backdrop.
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="planDetailsPanel">
            <header className="planDetailsHeader">
              <div>
                <span className="eyebrow">{tr("marketing.planDetails.eyebrow")}</span>
                <h2 id={titleId}>{tr("marketing.planDetails.title", { label: plan.label })}</h2>
                <p>{priceSummary(plan, tr)}</p>
              </div>
              <button
                type="button"
                className="planDetailsClose"
                aria-label={tr("marketing.planDetails.close")}
                ref={closeButton}
                onClick={close}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            {planDetailSections(plan, catalog, tr).map((section) => (
              <section
                className="planDetailsSection"
                key={section.key}
                aria-labelledby={titleId + section.key}
              >
                <h3 id={titleId + section.key}>{section.title}</h3>
                <dl>
                  {section.rows.map((row) => (
                    <div className="planDetailsRow" key={row.key} data-term={row.key}>
                      <dt>{row.label}</dt>
                      <dd>
                        {row.value}
                        {row.note ? <small>{row.note}</small> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <p className="planDetailsFinePrint">{tr("marketing.planDetails.finePrint")}</p>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
