import { canonicalErrorCode } from "./error-codes.js";
/** User-facing recovery for allowance and payment failures. Links are fixed
 * product routes, never provider error text or a URL supplied by a caller. */
export type RecoveryText = readonly [en: string, zh: string];
export type RecoveryAction = { href: string; label: RecoveryText };
export type BillingRecovery = {
  message: RecoveryText;
  actions: readonly RecoveryAction[];
  retry: "after_change" | "later" | "check_status";
};

const billing: RecoveryAction = {
  href: "/settings?section=billing",
  label: ["View plan & usage", "查看套餐与用量"],
};
const apps: RecoveryAction = {
  href: "/dashboard/connect/apps?view=connected",
  label: ["Manage connected accounts", "管理已连接账号"],
};
const support: RecoveryAction = {
  href: "https://remotearc.app/support?topic=billing",
  label: ["Get help", "联系支持"],
};
const plans: RecoveryAction = { href: "/checkout", label: ["Review plans", "查看套餐"] };
const recovery = (
  message: RecoveryText,
  actions: readonly RecoveryAction[],
  retry: BillingRecovery["retry"] = "after_change",
): BillingRecovery => ({ message, actions, retry });

const rules: readonly [readonly string[], BillingRecovery][] = [
  [
    ["MONTHLY_LIMIT_REACHED"],
    recovery(
      [
        "Your monthly Connect call allowance is used up. It resets at the start of the next UTC month. Review your usage or a plan with more calls before continuing.",
        "本月 Connect 调用额度已用完，将于下个 UTC 月开始时重置。请查看用量，或选择更多调用额度的套餐后继续。",
      ],
      [billing],
    ),
  ],
  [
    ["SLOW_LANE_RATE_LIMITED"],
    recovery(
      [
        "This month’s Free Connect calls are used up, so calls continue in the slow lane. Wait for the retry time before the next call, or choose Pro to keep your agent at full speed.",
        "本月 Free Connect 调用额度已用完，调用会继续在慢速通道运行。请等到重试时间后再调用，或选择 Pro，让你的 agent 恢复全速。",
      ],
      [plans, billing],
      "later",
    ),
  ],
  [
    ["BINARY_TRANSFER_LIMIT_REACHED"],
    recovery(
      [
        "This transfer would exceed your monthly file-transfer allowance. Review remaining usage, transfer less, or wait for the next UTC month. Paid plans have no monthly transfer cap.",
        "本次传输将超过每月文件传输额度。请查看剩余额度、减少传输量，或等到下个 UTC 月重置；付费套餐不设月度传输上限。",
      ],
      [billing],
    ),
  ],
  [
    ["APP_CONNECTION_LIMIT"],
    recovery(
      [
        "Your plan’s connected-account limit has been reached. Disconnect an account you no longer use, or review a plan with more connections. Reconnecting does not free a slot.",
        "已达到当前套餐的应用账号连接上限。请断开不再使用的账号，或查看支持更多连接的套餐；反复授权不会释放名额。",
      ],
      [apps, billing],
    ),
  ],
  [
    ["APP_DAILY_LIMIT_REACHED"],
    recovery(
      [
        "This connection or provider has reached its daily operation allowance. It resets at 00:00 UTC. Review your connections and wait for the reset; upgrading does not bypass provider limits.",
        "此连接或服务商的每日操作额度已用完，将于 UTC 00:00 重置。请核对连接并等待重置；升级套餐不会绕过服务商限制。",
      ],
      [apps],
      "later",
    ),
  ],
  [
    ["APP_COST_LIMIT"],
    recovery(
      [
        "The estimated operation exceeds the approved spending limit. Reduce the request or review its spending approval before trying again.",
        "预计操作用量超出了已批准的支出上限。请缩小请求，或核对支出授权后再试。",
      ],
      [apps],
    ),
  ],
  [
    ["APP_RATE_LIMITED", "MODEL_QUOTA_OR_RATE_LIMIT", "BILLING_RATE_LIMIT"],
    recovery(
      [
        "The service is temporarily limiting requests. Wait before trying again. Buying a plan or Credits does not remove this rate limit.",
        "服务暂时限制了请求频率，请稍后再试。购买套餐或 Credits 不会解除此速率限制。",
      ],
      [support],
      "later",
    ),
  ],
  [
    ["PLAN_UPGRADE_REQUIRED", "ARC_TRIAL_EXPIRED", "ARC_PLAN_EXCLUDES_HOSTED"],
    recovery(
      [
        "This feature needs an eligible plan. Review your current access and plan options. Connect and hosted Arc have separate allowances; a purchase is always your choice.",
        "此功能需要符合条件的套餐。请查看当前权限与套餐选项；Connect 与 Arc 托管模型额度分别计算，是否购买由你决定。",
      ],
      [billing],
    ),
  ],
  [
    ["ARC_TRIAL_REQUIRED"],
    recovery(
      [
        "Start your available Arc trial from chat before sending this request. You can review your trial and plan access in settings.",
        "请先在对话页开启可用的 Arc 试用，再发送请求。可在设置查看试用资格与套餐权限。",
      ],
      [billing],
    ),
  ],
  [
    ["ARC_CREDITS_EXHAUSTED", "BILLING_CREDITS_EXHAUSTED"],
    recovery(
      [
        "Available Arc Credits are insufficient for this work. Review your balance, reserved Credits and eligible top-ups or plans. Monthly Connect calls are a separate allowance.",
        "可用 Arc Credits 不足以执行本次工作。请查看余额、预留额度及适用的充值或套餐；每月 Connect 调用次数单独计算。",
      ],
      [billing],
    ),
  ],
  [
    ["ARC_DAILY_LIMIT_REACHED"],
    recovery(
      [
        "Today's Arc allowance is used up. It resets at 00:00 UTC. Your Credits, conversations and saved work are kept.",
        "今天的 Arc 额度已用完，将在 UTC 00:00 重置。你的 Credits、对话和已保存的工作都会保留。",
      ],
      [billing],
      "later",
    ),
  ],
  [
    [
      "BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE",
      "APP_PLATFORM_FUNDED_ALLOWANCE_REACHED",
      "APP_PLATFORM_BUDGET_NOT_CONFIGURED",
      "APP_BUDGET_NOT_CONFIGURED",
      "ARC_FUNDING_PAUSED_OR_LIMIT",
    ],
    recovery(
      [
        "The service’s spending budget or execution authorization is unavailable. Check with support before retrying. Buying more Credits may not resolve this restriction.",
        "服务支出预算或执行授权暂不可用，请联系支持确认后再试。购买更多 Credits 未必能解除此限制。",
      ],
      [support],
      "later",
    ),
  ],
  [
    ["BILLING_CHECKOUT_EXPIRED"],
    recovery(
      [
        "The earlier checkout has expired. You can choose a plan and start a new checkout.",
        "先前的结账已过期，可以重新选择套餐并开始新的结账。",
      ],
      [plans],
    ),
  ],
  [
    [
      "BILLING_CHECKOUT_ALREADY_OPEN",
      "BILLING_CHECKOUT_AWAITING_CONFIRMATION",
      "BILLING_PAYMENT_NOT_FINAL",
      "BILLING_FULFILLMENT_UNAVAILABLE",
      "PAYMENT_CONFIRMATION_UNKNOWN",
    ],
    recovery(
      [
        "An earlier payment or order still needs verification. Check its status before starting or paying for another order. Do not pay again while the result is unknown.",
        "先前的付款或订单仍待核实。请先查看状态，再决定是否创建或支付新订单；结果未确认时请勿再次付款。",
      ],
      [billing, support],
      "check_status",
    ),
  ],
  [
    [
      "BILLING_USE_EXISTING_SUBSCRIPTION",
      "BILLING_INVALID_PLAN_CHANGE",
      "BILLING_SUBSCRIPTION_CHANGED",
      "BILLING_SCHEDULE_CONFLICT",
      "BILLING_PLAN_CHANGE_BUSY",
    ],
    recovery(
      [
        "Review your current subscription and any pending change in Plan & usage. An existing subscription must be managed there; a new purchase may not be needed.",
        "请在“套餐与用量”核对当前订阅及待生效的变更。已有订阅应先进行管理，可能无需重新购买。",
      ],
      [billing],
      "check_status",
    ),
  ],
  [
    ["BILLING_SUBSCRIPTION_REQUIRED", "BILLING_SUBSCRIPTION_NOT_ACTIVE"],
    recovery(
      [
        "This action requires an active eligible subscription. Check its status before continuing. Credit top-ups require a paid Arc plan.",
        "此操作需要有效且符合条件的订阅，请核对订阅状态后继续。Credits 充值需要有效的 Arc 付费套餐。",
      ],
      [billing, plans],
    ),
  ],
  [
    ["BILLING_INVOICE_PAYMENT_FAILED"],
    recovery(
      [
        "An invoice payment failed. Review your invoice and update your payment method in Plan & usage. Check the existing subscription before making a new purchase.",
        "账单付款失败。请在“套餐与用量”核对账单并更新付款方式；重新购买前请先检查现有订阅。",
      ],
      [billing],
      "check_status",
    ),
  ],
  [
    ["BILLING_PAYMENT_METHOD_NOT_READY"],
    recovery(
      [
        "Payment method verification did not finish. Check the secure form and complete any bank verification before saving again.",
        "付款方式验证尚未完成，请检查安全表单，并完成银行要求的验证后再保存。",
      ],
      [billing],
    ),
  ],
  [
    ["BILLING_PRICE_CHANGED", "BILLING_CATALOG_CONFLICT", "BILLING_CONFIGURATION_CHANGED"],
    recovery(
      [
        "The offer changed. Refresh the available offers and review the current price and allowance before continuing.",
        "套餐条款已更新，请刷新可用套餐，核对当前价格和额度后再继续。",
      ],
      [plans],
    ),
  ],
  [
    ["BILLING_CHECKOUT_NOT_FOUND", "BILLING_CUSTOMER_REQUIRED"],
    recovery(
      [
        "This order or billing account could not be found for your signed-in account. Review Plan & usage, or contact support if you already paid.",
        "当前登录账号下未找到此订单或支付账号。请查看“套餐与用量”；如果已经付款，请联系支持核实。",
      ],
      [billing, support],
      "check_status",
    ),
  ],
  [
    [
      "BILLING_NOT_CONFIGURED",
      "BILLING_EMBEDDED_NOT_CONFIGURED",
      "BILLING_PROVIDER_ERROR",
      "BILLING_PROVIDER_UNAVAILABLE",
      "BILLING_UNAVAILABLE",
      "PAYMENT_FORM_LOAD_FAILED",
    ],
    recovery(
      [
        "Billing is temporarily unavailable. Check any existing order before trying again, and contact support if the problem continues.",
        "支付服务暂不可用。重试前请先核对已有订单；如果仍有问题，请联系支持。",
      ],
      [billing, support],
      "check_status",
    ),
  ],
];

export function billingRecovery(code: string): BillingRecovery | null {
  code = canonicalErrorCode(code) || "";
  for (const [codes, value] of rules) if (codes.includes(code)) return value;
  if (/^BILLING_PROMOTION_|^BILLING_INVALID_PROMOTION$/.test(code))
    return recovery(
      [
        "This offer cannot be applied. Check the code, expiry and plan eligibility, then review the total before paying.",
        "此优惠暂无法使用，请检查优惠码、有效期及适用套餐，并在付款前核对最终金额。",
      ],
      [plans],
    );
  // Administrative configuration, ownership, ledger and webhook failures must
  // never be presented as a reason to buy more Credits or replay a payment.
  if (/^BILLING_|^ARC_(?:BUDGET_|CREDITS_|TRIAL_CONFIGURATION_|FUNDING_)/.test(code))
    return recovery(
      [
        "This billing or allowance operation could not be verified. Review the current status and contact support with the error reference. Do not repeat an unconfirmed payment.",
        "此支付或额度操作未能核实。请查看当前状态，并保留错误编号联系支持；请勿重复未确认的付款。",
      ],
      [billing, support],
      "check_status",
    );
  return null;
}

/** Use only an owned session supplied by the billing API; this link performs
 * status checks and never creates another checkout or confirms a payment. */
export const paymentStatusHref = (sessionId?: string) =>
  sessionId && /^cs_[A-Za-z0-9_]{1,180}$/.test(sessionId)
    ? "/checkout?checkout=success&session_id=" + encodeURIComponent(sessionId)
    : billing.href;
