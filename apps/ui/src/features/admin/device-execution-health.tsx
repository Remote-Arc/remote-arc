import { useI18n } from "../../app/i18n.js";
import "./device-execution-health.css";

import type { DeviceExecutionHealth } from "./device-execution-health-model.js";
export type { DeviceExecutionHealth } from "./device-execution-health-model.js";
export function DeviceExecutionHealthPanel({ value }: { value?: DeviceExecutionHealth }) {
  const { tr } = useI18n();
  const measured = value?.coverage === "observed",
    degraded = value?.status === "degraded";
  const date = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");
  return (
    <section
      className="deviceExecutionHealth"
      aria-label={tr("Device execution health", "设备执行健康")}
    >
      {value?.sample && (
        <p className="deviceExecutionBoundary">
          {tr(
            "Sample data preview · not a real device incident.",
            "示例数据预览 · 以下不代表真实设备故障。",
          )}
        </p>
      )}
      <header>
        <div>
          <h3>{tr("Device execution", "设备执行")}</h3>
          <p>
            {tr(
              "Observed calls and expired connection signals · last 15 minutes",
              "实际调用与连接信号过期记录 · 最近 15 分钟",
            )}
          </p>
        </div>
        <span className={degraded ? "isDegraded" : ""}>
          {degraded
            ? tr("Issues observed", "发现异常")
            : measured
              ? tr("No recorded issues", "未记录异常")
              : tr("Awaiting observations", "等待观测")}
        </span>
      </header>
      <div className="deviceExecutionMetrics">
        {[
          { en: "Successful calls", zh: "成功调用", n: value?.successfulCalls },
          { en: "Response timeouts", zh: "响应超时", n: value?.timeouts },
          { en: "Expired signals", zh: "信号过期", n: value?.staleSignals },
          { en: "Affected devices", zh: "受影响设备", n: value?.affectedDevices },
        ].map((item) => (
          <div key={item.en}>
            <span>{tr(item.en, item.zh)}</span>
            <strong>
              {value && value.coverage !== "unavailable" ? item.n?.toLocaleString() : "—"}
            </strong>
          </div>
        ))}
      </div>
      {!!value?.keepAwakeFailures && (
        <p className="deviceExecutionEmpty">
          {value.keepAwakeFailures}{" "}
          {tr(
            "task keep-awake failures. A background Agent alone does not prevent sleep.",
            "次任务防休眠保障失败。后台 Agent 常驻本身不会阻止电脑休眠。",
          )}
        </p>
      )}
      {value?.devices.length ? (
        <div className="deviceExecutionIssues">
          {value.devices.map((device) => (
            <article key={device.deviceId}>
              <div>
                <strong>{device.name}</strong>
                <small>
                  {device.platform} · {device.deviceId.slice(0, 8)}
                </small>
              </div>
              <p>
                {device.timeouts} {tr("timeouts", "次超时")} · {device.staleSignals}{" "}
                {tr("expired signals", "次信号过期")} · {device.offlineCalls}{" "}
                {tr("offline dispatches", "次离线派发")}
                {device.keepAwakeFailures ? (
                  <>
                    {" "}
                    · {device.keepAwakeFailures} {tr("keep-awake failures", "次防休眠失败")}
                  </>
                ) : null}
              </p>
              <small>
                {tr("Latest issue: ", "最近异常：")}
                {date(device.lastFailureAt)} · {tr("Latest successful call: ", "最近成功调用：")}
                {date(device.lastSuccessfulCallAt)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="deviceExecutionEmpty">
          {measured
            ? tr(
                "No device execution issues recorded in this window.",
                "本窗口未记录设备执行异常。",
              )
            : tr(
                "No recent samples. Lack of errors does not prove a device can execute.",
                "暂无近期样本；没有错误记录不代表设备执行正常。",
              )}
        </p>
      )}
      <p className="deviceExecutionBoundary">
        {tr(
          "Online presence does not prove execution. An affected device is not evidence of a platform-wide outage. A timeout leaves the operation result unknown; inspect before retrying. Historical generic failures are not reclassified.",
          "在线状态不代表执行正常。单台设备异常不等于全平台故障。超时操作的执行结果待确认，重试前请检查。历史通用错误不追溯归类。",
        )}
        {value?.truncated ? " " + tr("Showing 20 devices.", "仅展示前 20 台设备。") : ""}
      </p>
    </section>
  );
}
