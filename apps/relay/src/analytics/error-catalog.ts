import { ERROR_CODE_SOURCES } from './error-code-index.generated.js';
export const FAILURE_CATEGORIES = ['quota', 'access', 'validation', 'conflict', 'dependency', 'execution', 'client', 'unknown'] as const;
export type FailureCategory = typeof FAILURE_CATEGORIES[number];
const categories: Record<FailureCategory, {
    label: string;
    meaning: string;
    action: string;
    attention: boolean;
}> = {
    quota: { label: '额度与容量', meaning: '调用、用量、任务预算或并发容量已达到限制。', action: '核对套餐、用量周期和限额；提示用户等待重置或查看升级选项。', attention: false },
    access: { label: '授权与权限', meaning: '当前账号、连接或设备缺少有效授权，或安全策略阻止了操作。', action: '核对登录账号、授权范围与权限设置；需要时请用户重新授权，勿绕过安全策略。', attention: false },
    validation: { label: '请求与配置', meaning: '请求参数、对象类型或配置不满足业务校验。', action: '核对调用阶段和客户端版本；修正输入或配置，检查是否为界面提交了无效状态。', attention: false },
    conflict: { label: '状态冲突', meaning: '对象状态已改变，或重复请求与当前执行状态冲突。', action: '读取最新状态后核对；涉及写操作先确认原操作结果，再决定是否重试。', attention: false },
    dependency: { label: '服务与依赖', meaning: '业务所需的内部服务或第三方服务不可用、超时或返回异常。', action: '结合请求标识、部署版本与依赖健康排查；确认原操作结果后再重试。', attention: true },
    execution: { label: '执行异常', meaning: '设备、浏览器或任务执行未正常完成。', action: '核对设备连接、唤醒状态、执行记录及版本；超时不代表未执行，避免自动重放写操作。', attention: true },
    client: { label: '前端异常', meaning: '浏览器观察到运行时、网络或支付组件异常，尚未由服务端确认。', action: '对照同一请求标识的服务端事件，核对页面与客户端环境。', attention: true },
    unknown: { label: '未分类', meaning: '收到未识别的错误；原始文本未保存，以免泄漏业务内容或凭据。', action: '根据请求标识与发生阶段排查，并为新的固定错误码补充目录。', attention: true },
};
const special: Record<string, {
    category: FailureCategory;
    meaning: string;
    action?: string;
}> = {
    BILLING_INVALID_PLAN_CHANGE: { category: 'conflict', meaning: '套餐变更不适用于当前订阅：可能没有可变更的付费订阅、目标套餐相同，或订阅状态不支持变更。', action: '核对账号订阅与目标套餐；首次购买应使用购买流程，已订阅用户再走套餐变更。' },
    BILLING_INVOICE_PAYMENT_FAILED: { category: 'dependency', meaning: '支付服务确认账单付款失败；会员权益是否生效需以服务端账本为准。', action: '核对账单和支付状态，请用户检查付款方式；勿重复扣款。' },
    MONTHLY_LIMIT_REACHED: { category: 'quota', meaning: '本月工具调用额度已用满。' },
    DEVICE_TIMEOUT: { category: 'execution', meaning: '设备未在等待窗口内返回。操作可能已执行，当前结果未知。' },
    DEVICE_SIGNAL_STALE: { category: 'execution', meaning: '设备连接信号已过期，在线标签不足以证明可执行。' },
    DEVICE_CALL_EXPIRED: { category: 'execution', meaning: '请求在 Agent 开始执行前已过期，此请求未开始执行。' },
    DEVICE_KEEP_AWAKE_FAILED: { category: 'execution', meaning: '任务未成功获得防休眠保障；后台 Agent 常驻不保证电脑持续唤醒。' },
    google_apps_beta_invitation_required: { category: 'access', meaning: '该账号尚未获准参加 Google Apps 内测。', action: '核对申请的 Google 账号、Google 测试用户名单与 Remote Arc 内测状态。' },
    google_app_data_consent_required: { category: 'access', meaning: '用户尚未确认 Google Apps 数据访问说明。' },
    app_reauthorization_required: { category: 'access', meaning: 'App 授权已过期、撤销或缺少所需权限，需要重新连接。' },
    AUTH_CODE_INVALID_OR_EXPIRED: { category: 'access', meaning: '登录验证码无效或已过期。' },
    AUTH_DELIVERY_FAILED: { category: 'dependency', meaning: '登录邮件未能确认成功投递。' },
    REQUEST_FAILED: { category: 'unknown', meaning: '该失败尚无可识别的固定错误码；原始响应内容未保存。' },
    CLIENT_ERROR: { category: 'client', meaning: '浏览器报告了运行时异常；未收集异常原文或页面内容。' },
    EMAIL_DELIVERY_UNKNOWN: { category: 'dependency', meaning: '邮件服务未确认投递结果，邮件可能已送达。', action: '先核对投递记录；结果不明时不要自动重发。' },
    EMAIL_PROVIDER_REJECTED: { category: 'dependency', meaning: '邮件服务拒绝了投递请求。', action: '核对服务配置、限额与退信原因，修正后再人工决定重发。' },
    TOOL_ERROR: { category: 'unknown', meaning: '工具失败，但未返回可识别的固定错误码。' },
    ARC_TOOL_OUTCOME_UNKNOWN: { category: 'execution', meaning: '任务中的工具操作可能已执行，但实际结果尚未确认。', action: '核对原操作与任务记录，避免自动重放写操作。' },
    EXTENSION_UPDATE_REQUIRED: { category: 'validation', meaning: '当前浏览器扩展版本不支持所需能力。', action: '更新浏览器扩展后重新检查连接，不要重复执行原写操作。' },
    DEVICE_VERSION_UNSUPPORTED: { category: 'validation', meaning: '当前 Agent 版本不支持所需能力。', action: '查看设备版本与升级指引，更新后重新核对能力。' },
    UNKNOWN_EFFECT: { category: 'execution', meaning: '写操作的实际效果尚未确认。', action: '先检查原操作结果，避免重复提交或自动重放。' },
    NETWORK_ERROR: { category: 'client', meaning: '浏览器网络请求失败；需与服务端记录交叉核对。' },
};
const subjects: Record<string, string> = { BILLING: '支付与套餐', ARC: 'Arc', MODEL: '模型', APP: 'App', AUTH: '账号认证', DEVICE: '设备', PLAN: '套餐', MONTHLY: '月度调用', BINARY: '二进制传输', GOOGLE: 'Google', APPS: 'App', SLACK: 'Slack', EMAIL: '邮件', OAUTH: 'OAuth', CLIENT: '客户端', PAYMENT: '支付', CHECKOUT: '结账', INVOICE: '账单', SUBSCRIPTION: '订阅', PROMOTION: '优惠', CUSTOMER: '支付账号', ACCOUNT: '账号', USER: '用户', CREDITS: 'Credits', CREDIT: 'Credit', BUDGET: '预算', TRIAL: '试用', CONFIGURATION: '配置', CONNECTION: '连接', TOKEN: '令牌', SCOPE: '权限范围', PERMISSION: '权限', RESOURCE: '资源', PROVIDER: '服务商', GRANT: '授权', SIGNATURE: '签名', REQUEST: '请求', RESPONSE: '响应', EVENT: '事件', DATA: '数据', CONSENT: '数据访问确认', CALL: '调用', OPERATION: '操作', ARGUMENTS: '参数', ATTACHMENT: '附件', MESSAGE: '消息', ROOM: '会话室', TEAM: '团队', EMPLOYEE: 'Teammate', DRAFT: '草稿', WORK: '工作', TASK: '任务', GOAL: '目标', AUTOMATION: '自动化', DISPATCH: '派发', HISTORY: '历史记录', CURSOR: '游标', MEMORY: '记忆', SKILL: '技能', SOURCE: '来源', VERIFICATION: '验证', CONTEXT: '上下文', FILE: '文件', PATH: '路径', WORKSPACE: '工作目录', PROCESS: '进程', BROWSER: '浏览器', RUNNER: '浏览器执行器', SESSION: '会话', UPLOAD: '上传', UNDO: '撤销', TOOLS: '工具', TOOL: '工具', ACCESS: '访问', CAPACITY: '容量', CAPTCHA: '验证码', REWARD: '奖励', RECIPIENT: '收件人', DELIVERY: '投递', CONTACT: '联系', BATCH: '群发批次', JSON: 'JSON', OBJECT: '对象', INPUT: '输入', ID: '标识', IDEMPOTENCY: '幂等', CODE: '验证码', RENEWAL: '续费', WALLET: '钱包', FUNDING: '资金', POOL: '资金池', SETTLEMENT: '结算', RESERVATION: '预留', USAGE: '用量', VERSION: '版本', IMAGE: '图片', TIME: '时间', TIMEZONE: '时区', SCHEDULE: '计划', RATE: '速率', LIMIT: '上限', SIZE: '大小', AUTHORITY: '执行权限', DECISION: '决策', CHECKPOINT: '检查点', EXECUTION: '执行', HANDSHAKE: '连接握手', SECRET: '保密输入', SAFETY: '安全策略', SENSITIVE: '敏感内容', ORIGIN: '请求来源', LINK: '关联', SERVER: '服务端' };
const reasons: Array<[
    RegExp,
    string,
    string
]> = [
    [/NOT_FOUND|NOT_FOUND_OR_ALREADY_REVOKED/, '对象不存在、已移除或当前账号无权访问', 'The object is missing, removed or inaccessible to this account'],
    [/NOT_CONFIGURED|NOT_ENABLED|DISABLED/, '功能或所需配置尚未启用', 'The feature or required configuration is disabled or missing'],
    [/UNAVAILABLE/, '当前不可用，需结合发生阶段排查', 'Unavailable at this stage; inspect the associated operation'],
    [/REAUTHORIZATION_REQUIRED|OAUTH_REQUIRED|AUTHORIZATION_DENIED/, '需要重新授权或用户未同意授权', 'Authorization is missing, denied or needs renewal'],
    [/TOO_LARGE|TOO_MANY_PAGES|TOO_MANY/, '超出允许的大小或数量', 'The supported size or count was exceeded'],
    [/LIMIT_REACHED|EXHAUSTED|QUOTA|RATE_LIMITED|RATE_LIMIT/, '触及用量、速率或容量限制', 'A usage, rate or capacity limit was reached'],
    [/CONFLICT|CHANGED|MISMATCH/, '当前状态或标识与请求不一致', 'The current state or identity conflicts with the request'],
    [/ALREADY|IN_PROGRESS|BUSY/, '操作已处理或仍在进行', 'The operation was already handled or is still in progress'],
    [/REVOKED|DENIED|FORBIDDEN|NOT_AUTHORIZED|NOT_ALLOWED/, '授权不足、已撤销或被安全策略拒绝', 'Authorization is missing, revoked or denied by policy'],
    [/EXPIRED/, '有效期已结束', 'The validity period has ended'],
    [/INVALID|UNSUPPORTED/, '参数、格式或状态不符合支持条件', 'The input, format or state is invalid or unsupported'],
    [/REQUIRED/, '缺少继续操作所需的条件', 'A required condition for this operation is missing'],
    [/TIMEOUT|TIMED_OUT/, '等待超过限制，需确认原操作结果', 'The response deadline elapsed; verify the original effect'],
    [/FAILED|ERROR|UNCONFIRMED|UNKNOWN/, '未能确认正常完成，需查看关联记录', 'Successful completion is unconfirmed; inspect correlated records'],
];
function codeExplanation(code: string, category: FailureCategory) {
    const reason = reasons.find(([pattern]) => pattern.test(code.toUpperCase()));
    const words = code.toUpperCase().split('_').filter(word => !['NOT', 'FOUND', 'INVALID', 'UNSUPPORTED', 'REQUIRED', 'FAILED', 'ERROR', 'UNAVAILABLE', 'CONFIGURED', 'ENABLED', 'DISABLED', 'REACHED', 'EXHAUSTED', 'CONFLICT', 'CHANGED', 'MISMATCH', 'ALREADY', 'IN', 'PROGRESS', 'BUSY', 'REVOKED', 'DENIED', 'FORBIDDEN', 'AUTHORIZED', 'ALLOWED', 'EXPIRED'].includes(word));
    const topic = words.map(word => subjects[word] || word.toLowerCase()).join(' · ');
    return { meaning: topic + '：' + (reason?.[1] || categories[category].meaning) + '。', meaningEn: words.map(word => word.toLowerCase()).join(' · ') + ': ' + (reason?.[2] || 'The business guard or operation did not complete successfully') + '.' };
}
const englishActions: Record<FailureCategory, string> = { quota: 'Check plan allowance, reset period and capacity. Show the user reset or upgrade options.', access: 'Check the account, scopes and permissions. Reauthorize when needed; do not bypass a safety policy.', validation: 'Check the request fields, client version and configuration. Verify whether the UI submitted an invalid state.', conflict: 'Read the current state and check the original effect before retrying a write.', dependency: 'Correlate the request ID, deployment and dependency health. Verify the original result before retrying.', execution: 'Check device wake state, connection, permissions and execution history. Do not automatically replay writes after a timeout.', client: 'Compare this unverified browser report with server observations for the same request.', unknown: 'Use the request ID and stage to investigate, then add a fixed code to the catalog.' };
const englishSpecial: Record<string, string> = { BILLING_INVALID_PLAN_CHANGE: 'The current subscription does not support this plan change. There may be no paid subscription, the plan may already match, or the subscription state may prevent changes.', BILLING_INVOICE_PAYMENT_FAILED: 'The payment provider confirmed an invoice payment failure. Entitlements must be checked against the server ledger.', MONTHLY_LIMIT_REACHED: 'The monthly tool-call allowance has been used up.', DEVICE_TIMEOUT: 'The device did not reply before the deadline. The operation may have executed; its result is unknown.', DEVICE_SIGNAL_STALE: 'The device connection signal expired. Online presence alone does not establish execution health.', DEVICE_CALL_EXPIRED: 'The request expired before the Agent started it. This request did not start execution.', DEVICE_KEEP_AWAKE_FAILED: 'The task could not obtain its keep-awake guarantee. A background Agent alone does not prevent sleep.', google_apps_beta_invitation_required: 'This account has not been admitted to the Google Apps beta.', google_app_data_consent_required: 'The user has not yet accepted the Google Apps data access notice.', app_reauthorization_required: 'The App authorization expired, was revoked or lacks a required scope. Reconnection is needed.', AUTH_CODE_INVALID_OR_EXPIRED: 'The sign-in code is invalid or expired.', AUTH_DELIVERY_FAILED: 'Delivery of the sign-in email could not be confirmed.', REQUEST_FAILED: 'This failure has no recognized fixed code. The original error text was not stored.', CLIENT_ERROR: 'The browser reported a runtime failure. No exception text or page content was collected.', NETWORK_ERROR: 'A browser network request failed. Compare it with server observations.', EMAIL_DELIVERY_UNKNOWN: 'Email delivery was not confirmed; the message may have arrived. Do not automatically resend.', EMAIL_PROVIDER_REJECTED: 'The email provider rejected the delivery request.', UNKNOWN_EFFECT: 'The effect of a write has not been confirmed. Inspect it before retrying.', TOOL_ERROR: 'The tool failed without a recognized fixed error code.' };
export function safeFailureCode(value: unknown): string { return typeof value === 'string' && Object.hasOwn(ERROR_CODE_SOURCES, value) ? value : 'REQUEST_FAILED'; }
export function failureCategory(value: unknown) {
    const code = safeFailureCode(value), upper = code.toUpperCase();
    let category: FailureCategory = 'unknown';
    if (special[code])
        category = special[code]!.category;
    else if (/CLIENT|NETWORK_ERROR|PAYMENT_FORM|CONFIRMATION_TIMEOUT/.test(upper))
        category = 'client';
    else if (/UNAVAILABLE|NOT_CONFIGURED|PROVIDER_(?:FAILED|ERROR)|INVALID_(?:RESPONSE|TOKEN_RESPONSE|TOOL_RESPONSE)|INCOMPLETE_RESPONSE/.test(upper))
        category = 'dependency';
    else if (/INVALID/.test(upper) && !upper.startsWith('AUTH_'))
        category = 'validation';
    else if (/LIMIT|QUOTA|EXHAUSTED|TOO_MANY|BUDGET|PLAN_UPGRADE|TRIAL_EXPIRED|TRIAL_REQUIRED/.test(upper))
        category = 'quota';
    else if (/AUTH|FORBIDDEN|PERMISSION|DENIED|BLOCKED|SAFETY|INSUFFICIENT|SCOPE|APPROVAL|CONSENT|SIGNATURE|TOKEN|PAUSED|CAPTCHA|SENSITIVE|REVOKED|REQUIRED|NOT_ALLOWED/.test(upper))
        category = 'access';
    else if (/CONFLICT|CHANGED|BUSY|ALREADY|IN_PROGRESS|NOT_READY|NOT_FINAL|EXPIRED|CANCELLED|UNKNOWN_EFFECT|OUTCOME_UNKNOWN|STATE/.test(upper))
        category = 'conflict';
    else if (/DEVICE|BROWSER|RUNNER|PROCESS|FILE|PATH|UNDO|WORKSPACE|EXECUTION|STALE_REF|WAIT_TIMEOUT/.test(upper))
        category = 'execution';
    else if (/UNAVAILABLE|FAILED|ERROR|TIMEOUT|NOT_CONFIGURED|INVALID_RESPONSE|INVALID_TOKEN_RESPONSE|INCOMPLETE_RESPONSE/.test(upper))
        category = 'dependency';
    else if (code !== 'REQUEST_FAILED')
        category = 'validation';
    return category;
}
export function failureDefinition(value: unknown, status?: number | null) {
    const code=safeFailureCode(value),category=failureCategory(code);
    // An HTTP server failure is actionable even if its code normally denotes a guard.
    const attention = Boolean(status && status >= 500) || categories[category].attention;
    const explanation=codeExplanation(code,category);
    return { code, category, ...categories[category], ...explanation, meaning: special[code]?.meaning || explanation.meaning, meaningEn: englishSpecial[code] || explanation.meaningEn, action: special[code]?.action || categories[category].action, actionEn: code === 'BILLING_INVALID_PLAN_CHANGE' ? 'Check the current subscription and target plan. First-time purchases should use checkout; only existing subscriptions can change plans.' : code === 'EMAIL_DELIVERY_UNKNOWN' ? 'Check delivery evidence first. Do not automatically resend a message with an unknown outcome.' : englishActions[category], attention, sources: ERROR_CODE_SOURCES[code] || [] };
}
export function errorCatalog() { return Object.keys(ERROR_CODE_SOURCES).sort().map(code => failureDefinition(code)); }
