export type Translate = (en: string, zh: string) => string;
export type SceneId = 'login' | 'devices' | 'payment' | 'tasks';
export type Step = {key: string; count: number; rate: number | null; previousRate: number | null; dropoff: number};
export type Orders = {total: number; ready: number; paid: number; fulfilled: number; pending: number; refunded: number; unattributed: number};
export type Scene = {id: string; total: number; completed: number; rate: number | null; pending: number; failed: number; unfinished: number; incompleteEvidence: number; steps: Step[]; historyUnmeasured?: number; cancelled?: number; unknown?: number; orders?: Orders};
export type Summary = {newUsers: number; activeUsers: number; payingUsers: number; paidCents: number; newPaired: number; newUsed: number; newPaid: number};
export type RetentionCell = {day: number; status: 'ready' | 'observing' | 'not_collected'; returned: number; eligible: number; rate: number | null};
export type Analytics = {
 checkedAt: string; days: number; from: string; to: string; timezone: string; previousFrom: string; previousTo: string;
 summary: Summary; scenes: Scene[]; loginMethods: Scene[]; previous: {summary: Summary; scenes: Scene[]; loginMethods: Scene[]};
 trend: {day: string; newUsers: number; activeUsers: number; payingUsers: number}[];
 retention: RetentionCell[]; cohorts: {day: string; users: number; cells: RetentionCell[]}[];
 coverage: {flowSince: string | null; activityCompleteFrom: string | null; oldestEvent: string | null; recordedEvents: number; includesInternalAccounts: boolean};
};
export function percent(value: number | null | undefined) {return typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—';}
export function rate(numerator: number, denominator: number) {return denominator > 0 ? numerator / denominator : null;}
export function percentagePoints(current: number | null | undefined, previous: number | null | undefined) {return typeof current === 'number' && typeof previous === 'number' ? Math.round((current - previous) * 1000) / 10 : null;}
export function sceneName(id: string, tr: Translate) {return ({login: tr('Sign-in', '登录'), devices: tr('Connect a device', '连接设备'), payment: tr('Purchase', '支付购买'), tasks: tr('Run a task', '任务执行'), email_login: tr('Email code', '邮箱验证码'), google_login: tr('Google sign-in', 'Google 登录')} as Record<string, string>)[id] || id;}
export function stepName(scene: string, key: string, tr: Translate) {
 const labels: Record<string, Record<string, [string, string]>> = {
 login: {started: ['Started sign-in', '发起登录'], verification: ['Entered verification', '进入验证'], verified: ['Identity verified', '验证通过'], completed: ['Signed in', '登录成功']},
 email_login: {started: ['Code requested', '请求验证码'], delivered: ['Email accepted by sender', '邮件服务已接收'], verification: ['Code submitted', '提交验证码'], verified: ['Code verified', '校验通过'], completed: ['Signed in', '登录成功']},
 google_login: {started: ['Started Google sign-in', '发起 Google 登录'], callback: ['Returned from Google', '从 Google 返回'], verified: ['Identity verified', '验证通过'], completed: ['Signed in', '登录成功']},
 devices: {started: ['Pairing started', '发起配对'], approved: ['Connection approved', '用户确认授权'], online: ['Device connected', '设备真正上线']},
 payment: {entered: ['Opened purchase page', '进入购买页'], ordered: ['Order created', '创建订单'], paid: ['Payment confirmed', '付款已确认'], fulfilled: ['Access delivered', '权益已到账']},
 tasks: {started: ['Task created', '发起任务'], succeeded: ['Task succeeded', '成功完成']}};
 const label = labels[scene]?.[key]; return label ? tr(...label) : key;
}
export function biggestDrop(scene: Scene | undefined) {return scene?.steps.slice(1).reduce<Step | null>((best, step) => step.dropoff > (best?.dropoff || 0) ? step : best, null) || null;}
export function retentionState(cell: RetentionCell | undefined, tr: Translate) {return !cell ? tr('Unavailable', '暂不可用') : cell.status === 'observing' ? tr('Still observing', '观察中') : cell.status === 'not_collected' ? tr('Not collected', '尚未采集') : !cell.eligible ? tr('No eligible users', '暂无到期样本') : '';}
export function validAnalytics(value: unknown): value is Analytics {
 if (!value || typeof value !== 'object') return false;
 const data=value as Analytics,number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 const fraction=(value:unknown)=>value===null||number(value)&&Number(value)<=1;
 const summary=(value:Summary)=>!!value&&['newUsers','activeUsers','payingUsers','paidCents','newPaired','newUsed','newPaid'].every(key=>number(value[key as keyof Summary]));
 const scene=(value:Scene)=>!!value&&number(value.total)&&number(value.completed)&&number(value.pending)&&number(value.unfinished)&&fraction(value.rate)&&Array.isArray(value.steps)&&value.steps.every((step,index)=>typeof step.key==='string'&&number(step.count)&&step.count<=value.total&&(!index||step.count<=value.steps[index-1]!.count)&&fraction(step.rate)&&fraction(step.previousRate));
 return typeof data.checkedAt==='string'&&Number.isFinite(Date.parse(data.checkedAt))&&summary(data.summary)&&summary(data.previous?.summary)&&
 Array.isArray(data.scenes)&&['login','devices','payment','tasks'].every(id=>data.scenes.some(value=>value.id===id&&scene(value)))&&
 Array.isArray(data.loginMethods)&&data.loginMethods.every(scene)&&Array.isArray(data.previous.scenes)&&data.previous.scenes.every(scene)&&Array.isArray(data.previous.loginMethods)&&
 Array.isArray(data.retention)&&data.retention.every(cell=>[1,7,30].includes(cell.day)&&fraction(cell.rate)&&number(cell.eligible)&&number(cell.returned))&&
 Array.isArray(data.cohorts)&&data.cohorts.every(row=>typeof row.day==='string'&&number(row.users)&&Array.isArray(row.cells))&&
 Array.isArray(data.trend)&&data.trend.every(row=>typeof row.day==='string'&&number(row.newUsers)&&number(row.activeUsers)&&number(row.payingUsers))&&!!data.coverage;
}
