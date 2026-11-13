import { OverviewGreeting } from "../../../components/overview-greeting.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { UsageConversionBanner } from "../usage-conversion.js";
import { MARKETING_ORIGIN } from "../../../config/app-config.js";
import { platformLabel } from "../devices/device-presets.js";
import { CopyButton } from "../../../components/public-layout.js";
import { timeAgo } from "../format.js";
import { FirstRunCard } from "./first-run-card.js";
import {
  ActivityListSkeleton,
  AttentionListSkeleton,
  DeviceListSkeleton,
  SkeletonText,
  UsageBannerSkeleton,
} from "./overview-skeleton.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import { useOverviewLayoutHint } from "../../../hooks/dashboard/use-overview-layout-hint.js";

// Overview tab: status cards, recent devices and activity.
export function OverviewView({ m }: { m: DashboardModel }) {
  const {
    automationAttentionCount,
    automationLoadError,
    automationsLoaded,
    deviceNameById,
    devices,
    eventLabel,
    hasAttention,
    locale,
    mcpEndpoint,
    navigateTab,
    refreshAutomations,
    setShowAdd,
    status,
    statusLoaded,
    tr,
    usage,
    usageLimitLabel,
    usagePct,
    user,
  } = m;
  // Placeholders show until the first data arrives; background refreshes keep
  // the real content on screen.
  const statusLoading = !statusLoaded;
  const attentionLoading = statusLoading || !automationsLoaded;
  const layout = useOverviewLayoutHint(
    user.id,
    attentionLoading
      ? null
      : {
          devices: Math.min(5, devices.length),
          activity: status?.recentActivity?.length ?? 0,
        },
  );
  return (
    <>
      <section className="overviewTopbar">
        <div>
          <span className="eyebrow">{tr("dashboard.views.overviewView.overview")}</span>
          <OverviewGreeting name={user.name} tr={tr} />
          <p>{tr("dashboard.views.overviewView.yourConnectionsRecentWorkAndEverything")}</p>
          <span className="overviewLoadingStatus" role="status">
            {attentionLoading ? tr("dashboard.views.overviewView.loadingYourOverview") : ""}
          </span>
        </div>
        <div className="overviewActions">
          <button className="ghostButton" onClick={() => setShowAdd(true)}>
            + {tr("dashboard.views.overviewView.addDevice")}
          </button>
          <button className="addButton arcRadiantCta" onClick={() => navigateTab("connect")}>
            <ProductIcon name="link" />
            {tr("dashboard.views.overviewView.connectYourAi")}
          </button>
        </div>
      </section>
      {/* The pairing guide waits for the data: showing it to an account that has
          a computer, then removing it, would move the whole page. */}
      {!statusLoading && <FirstRunCard m={m} />}
      {/* No wrapper: the banner must stay a direct child of the dashboard
          column, whose rules set its width. */}
      {statusLoading ? (
        !!layout.exact?.banner && (
          <UsageBannerSkeleton height={layout.exact.banner} gap={layout.exact.bannerGap} />
        )
      ) : (
        <UsageConversionBanner
          sectionRef={layout.refs.banner}
          usage={usage}
          pricingUrl={MARKETING_ORIGIN + (locale === "zh" ? "/zh/pricing" : "/pricing")}
          onManagePlan={() => {
            navigateTab("settings");
            const target = new URL(location.href);
            target.searchParams.set("section", "billing");
            history.replaceState(history.state, "", target);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        />
      )}
      <section className="overviewStatusGrid" aria-busy={statusLoading}>
        <article className="overviewStatusCard">
          <div className="statusCardHead">
            <span>{tr("dashboard.views.overviewView.devicesOnline")}</span>
            <i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} />
          </div>
          <strong>
            {statusLoading ? (
              <SkeletonText width="3.2ch" />
            ) : (
              <>
                {status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}
              </>
            )}
          </strong>
          <small>{tr("dashboard.views.overviewView.readyForMcpCalls")}</small>
        </article>
        <article className="overviewStatusCard">
          <div className="statusCardHead">
            <span>{tr("dashboard.views.overviewView.connectedApps")}</span>
            <ProductIcon name="apps" />
          </div>
          <strong>{tr("dashboard.views.overviewView.yourTools")}</strong>
          <button className="ghostButton overviewManageLink" onClick={() => navigateTab("apps")}>
            {tr("dashboard.views.overviewView.manageConnections")}
            <ProductIcon name="arrowUpRight" size={14} />
          </button>
        </article>
        <article className="overviewStatusCard">
          <div className="statusCardHead">
            <span>{tr("dashboard.views.overviewView.monthlyUsage")}</span>
            <span>
              {statusLoading ? (
                <SkeletonText width="3ch" />
              ) : usage?.unlimited ? (
                tr("dashboard.views.overviewView.unlimited")
              ) : (
                Math.round(usagePct) + "%"
              )}
            </span>
          </div>
          <strong>
            {statusLoading ? <SkeletonText width="2.6ch" /> : (usage?.used ?? 0).toLocaleString()}
          </strong>
          <div className="miniUsageBar">
            <i style={{ width: (usage?.unlimited ? 0 : usagePct) + "%" }} />
          </div>
          <small>
            {statusLoading ? (
              <SkeletonText width="70%" />
            ) : usage?.unlimited ? (
              tr("dashboard.views.overviewView.unlimitedConnectCalls")
            ) : (
              tr("dashboard.views.overviewView.of") +
              " " +
              usageLimitLabel +
              " " +
              tr("dashboard.views.overviewView.hostedCalls")
            )}
          </small>
        </article>
        <article className="overviewStatusCard endpoint">
          <div className="statusCardHead">
            <span>Remote MCP</span>
            <span className="privacyPill">{tr("dashboard.views.overviewView.secure")}</span>
          </div>
          <code>{mcpEndpoint}</code>
          <div className="statusCardActions">
            <CopyButton value={mcpEndpoint} label={tr("dashboard.views.overviewView.copy")} />
            <button className="ghostButton" onClick={() => navigateTab("connect")}>
              {tr("dashboard.views.overviewView.manage")}
            </button>
          </div>
        </article>
      </section>

      <section className="overviewQuickGrid" aria-busy={attentionLoading}>
        <article className="overviewQuickCard">
          <span className="eyebrow">{tr("dashboard.views.overviewView.quickActions")}</span>
          <div className="quickActionList">
            <button onClick={() => setShowAdd(true)}>
              <span>
                <ProductIcon name="add" />
              </span>
              <div>
                <strong>{tr("dashboard.views.overviewView.pairAComputer")}</strong>
                <small>{tr("dashboard.views.overviewView.addWindowsMacosOrLinux")}</small>
              </div>
            </button>
            <button onClick={() => navigateTab("connect")}>
              <span>
                <ProductIcon name="link" />
              </span>
              <div>
                <strong>{tr("dashboard.views.overviewView.connectAnAiClient")}</strong>
                <small>ChatGPT · Claude · Remote MCP</small>
              </div>
            </button>
            <button onClick={() => navigateTab("security")}>
              <span>
                <ProductIcon name="shield" />
              </span>
              <div>
                <strong>{tr("dashboard.views.overviewView.reviewSecurity")}</strong>
                <small>{tr("dashboard.views.overviewView.sessionsScopesAndDevicePolicies")}</small>
              </div>
            </button>
            <button onClick={() => navigateTab("apps")}>
              <span>
                <ProductIcon name="apps" />
              </span>
              <div>
                <strong>{tr("dashboard.views.overviewView.connectYourApps")}</strong>
                <small>
                  {tr("dashboard.views.overviewView.oneAccountConnectionAvailableToYour")}
                </small>
              </div>
            </button>
          </div>
        </article>
        <article className="overviewAttentionCard">
          <span className="eyebrow">{tr("dashboard.views.overviewView.attention")}</span>
          {attentionLoading ? (
            <AttentionListSkeleton
              rows={layout.hint.rows.attention}
              height={layout.exact?.attention}
            />
          ) : (
            <div className="attentionList" ref={layout.refs.attention}>
              {!!automationAttentionCount && (
                <button onClick={() => navigateTab("automations")}>
                  <i className="attentionIcon warn">!</i>
                  <div>
                    <strong>
                      {automationAttentionCount}{" "}
                      {tr("dashboard.views.overviewView.taskSNeedAttention")}
                    </strong>
                    <small>{tr("dashboard.views.overviewView.askYourConnectedAiToReview")}</small>
                  </div>
                </button>
              )}
              {automationLoadError && (
                <button onClick={() => void refreshAutomations()}>
                  <i className="attentionIcon warn">!</i>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.taskStatusUnavailable")}</strong>
                    <small>{tr("dashboard.views.overviewView.retryToSeeCurrentProgress")}</small>
                  </div>
                </button>
              )}
              {!devices.length && (
                <button onClick={() => setShowAdd(true)}>
                  <i className="attentionIcon warn">!</i>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.noComputerPaired")}</strong>
                    <small>{tr("dashboard.views.overviewView.pairYourFirstDeviceToStart")}</small>
                  </div>
                </button>
              )}
              {!!devices.length && devices.some((device) => device.status === "offline") && (
                <button onClick={() => navigateTab("devices")}>
                  <i className="attentionIcon idle">•</i>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.someDevicesAreOffline")}</strong>
                    <small>
                      {devices.filter((device) => device.status === "offline").length}{" "}
                      {tr("dashboard.views.overviewView.deviceSUnavailableForMcpCalls")}
                    </small>
                  </div>
                </button>
              )}
              {usagePct >= 80 && (
                <button onClick={() => navigateTab("settings")}>
                  <i className="attentionIcon warn">!</i>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.usageIsGettingHigh")}</strong>
                    <small>
                      {Math.round(usagePct)}%{" "}
                      {tr("dashboard.views.overviewView.ofYourMonthlyHostedAllowanceIs")}
                    </small>
                  </div>
                </button>
              )}
              {(status?.onlineDevices ?? 0) > 0 && !hasAttention && !automationLoadError && (
                <div className="attentionClear">
                  <i>✓</i>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.everythingLooksGood")}</strong>
                    <small>{tr("dashboard.views.overviewView.devicesAreOnlineAndNoTasks")}</small>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      </section>

      <section className="overviewMainGrid" aria-busy={statusLoading}>
        <div className="panelBlock overviewDevicesPanel">
          <div className="blockHeader">
            <div>
              <span className="eyebrow">{tr("dashboard.views.overviewView.devices")}</span>
              <h2>{tr("dashboard.views.overviewView.deviceStatus")}</h2>
            </div>
            <button className="ghostButton" onClick={() => navigateTab("devices")}>
              {tr("dashboard.views.overviewView.manage")}
            </button>
          </div>
          {statusLoading ? (
            <DeviceListSkeleton rows={layout.hint.rows.devices} height={layout.exact?.devices} />
          ) : (
            <div className="overviewDeviceList" ref={layout.refs.devices}>
              {devices
                .slice()
                .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"))
                .slice(0, 5)
                .map((device) => (
                  <button
                    className="overviewDeviceRow"
                    key={device.id}
                    onClick={() => navigateTab("devices")}
                  >
                    <div className="deviceIcon">
                      <ProductIcon name="device" />
                    </div>
                    <div>
                      <strong>{device.name}</strong>
                      <span>
                        {platformLabel(device.platform)} ·{" "}
                        {device.hostname || tr("dashboard.views.overviewView.noHostname")}
                      </span>
                    </div>
                    <div className="overviewDeviceMeta">
                      <span>{device.tools.length} tools</span>
                      <small>{timeAgo(device.last_seen)}</small>
                    </div>
                    <span className={"badge " + device.status}>
                      <i />
                      {device.status === "online"
                        ? tr("dashboard.views.overviewView.online")
                        : tr("dashboard.views.overviewView.offline")}
                    </span>
                  </button>
                ))}
              {!devices.length && (
                <button className="overviewDeviceRow empty" onClick={() => setShowAdd(true)}>
                  <div className="deviceIcon">＋</div>
                  <div>
                    <strong>{tr("dashboard.views.overviewView.addYourFirstComputer")}</strong>
                    <span>{tr("dashboard.views.overviewView.oneCommandThenApproveInYour")}</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="panelBlock overviewActivityPanel">
          <div className="blockHeader">
            <div>
              <span className="eyebrow">{tr("dashboard.views.overviewView.recentActivity")}</span>
              <h2>{tr("dashboard.views.overviewView.whatRemoteArcDid")}</h2>
            </div>
            <span className="privacyPill">
              {tr("dashboard.views.overviewView.argumentsNotLogged")}
            </span>
          </div>
          {statusLoading ? (
            <ActivityListSkeleton
              rows={layout.hint.rows.activity}
              height={layout.exact?.activity}
            />
          ) : (
            <div className="activityList" ref={layout.refs.activity}>
              {(status?.recentActivity || []).map((event) => (
                <div className="activityItem" key={event.id}>
                  <i className={event.success ? "eventIcon success" : "eventIcon failed"}>
                    {event.success ? "✓" : "!"}
                  </i>
                  <div>
                    <strong>{eventLabel(event)}</strong>
                    <span>
                      {event.client_name ||
                        event.client_id?.slice(0, 12) ||
                        tr("dashboard.views.overviewView.unknownClient")}{" "}
                      ·{" "}
                      {event.device_id
                        ? deviceNameById.get(event.device_id) || event.device_id.slice(0, 8)
                        : tr("dashboard.views.overviewView.account")}{" "}
                      · {timeAgo(event.created_at)}
                      {event.request_id ? " · req " + event.request_id.slice(0, 8) : ""}
                    </span>
                  </div>
                </div>
              ))}
              {!status?.recentActivity?.length && (
                <div className="activityEmpty">
                  <strong>{tr("dashboard.views.overviewView.noActivityYet")}</strong>
                  <span>{tr("dashboard.views.overviewView.pairADeviceOrCallA")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
