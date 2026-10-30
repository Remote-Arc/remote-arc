type Translate = (en: string, zh: string) => string;

export type PairingFailure = {
  error?: string;
  limit?: number | null;
  device_type?: string;
};

export const atComputerLimit = (failure: PairingFailure) =>
  failure.error === "device_limit_reached" && failure.device_type === "computer";

/** Turns /api/pairing/approve failures into text a person can act on. */
export function pairingFailureMessage(failure: PairingFailure, tr: Translate) {
  if (atComputerLimit(failure)) {
    return tr(
      `This account has reached its limit of ${failure.limit} computers. Remove one you no longer use, or upgrade for unlimited computers.`,
      `这个账号已达到 ${failure.limit} 台电脑的上限。请移除不再使用的电脑，或升级以连接更多电脑。`,
    );
  }
  if (failure.error === "device_limit_reached") {
    return tr(
      `This account has reached its limit of ${failure.limit} browser installations. Remove one you no longer use.`,
      `这个账号已达到 ${failure.limit} 个浏览器安装的上限。请移除不再使用的安装。`,
    );
  }
  if (failure.error === "device_registration_rate_limited") {
    return tr(
      "Too many new computers were added in the last 24 hours. Try again later.",
      "过去 24 小时内新增的电脑过多，请稍后再试。",
    );
  }
  if (failure.error === "pairing_changed" || failure.error === "Pairing is no longer pending") {
    return tr(
      "This pairing code was already used or has expired. Start Remote Arc on your computer again to get a new one.",
      "这个配对码已被使用或已过期。请在电脑上重新启动 Remote Arc，获取新的配对码。",
    );
  }
  return failure.error || tr("Could not approve device", "设备授权失败");
}
