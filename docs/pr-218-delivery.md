# PR 218 统一交付记录

更新：2026-10-19。此记录区分代码准备完成、预览验收与生产启用。主审阅入口是 [PR 218](https://github.com/Remote-Arc/remote-arc/pull/218)，不是已发布公告。

## PR 收拢

| 原 PR | 收录内容 | 收拢证明 |
| --- | --- | --- |
| #215 | Arc 个人首页、问候、任务/例行工作汇总、需要关注的事项 | 原提交 `15fe54a` 已以等价补丁收录；`git cherry HEAD origin/feat/arc-chat-home` 无未收录补丁 |
| #216 | 原始蓝色 Logo、拓扑电流、节点响应、两种模式的品牌动效 | 原提交 `48a9705`、`c6c0816` 已以等价补丁收录；`git cherry HEAD origin/fix/brand-blue-current` 无未收录补丁 |
| #217（已合并） | 中性配色及首页演示样式收尾 | 当前 master `0963120` 已合入 #218 |

#215、#216 由 #218 取代，保留分支与历史记录。不要重复合并这三份补丁，也不应分别发布旧预览版本。

## 当前代码包含什么

| 范围 | 交付内容 | 开放条件 |
| --- | --- | --- |
| 官网与工作区 | 原蓝色 Logo 与完整字标、更大 Dashboard 字号、双产品导航、品牌图标、移除过时 Connect 视频、设备与设置样式 | 随正常代码发布；Connect 继续开放 |
| 动态演示 | 六个场景使用对应工具/文件图标；授权账号执行到结果；Runway 任务查询；中英文连接链接；切换重置；减少动画偏好直接显示结果 | 始终是模拟数据，无真实操作或付费生成 |
| 客户页面 | Terms、Privacy、Support 共用当前布局、明暗主题及中英文路由；Support 复用 Feedback 表单、API 与后台收件箱 | 预览不提交生产数据；生产沿用已有后端 |
| Arc Chat | 托管模型、会话状态、Apps/设备工具执行、对话式任务和 routines、个人摘要、错误恢复及实际服务端用量限制 | 平台凭证与小规模真实验收完成前保持 Coming soon |
| 模型与 Credits | 平台持有 OpenAI/Anthropic Key；Auto 路由；Plus/Pro 同样可选高级模型；按实际模型成本加权扣额；原子预留与结算 | 用户无须 API Key；服务端允许的已配置模型才可用 |
| Stripe | Checkout、签名验证、订阅发放、退款/争议撤销、下周期改套餐、Portal、关闭 Arc 时仍可管理订阅 | 平台 Stripe 凭证、Webhook 与真实账户验收 |
| SaaS 工具 | 共用运行时定价目录，测算推理、支付、云、Apps、支持、Free 与试用成本；同时检查周期毛利与首月贡献 | 测算假设需要用实际账单替换，不能保证实际毛利 |
| Apps | 29 个应用、221 个原生可执行工具、8 类；连接授权范围内读写默认启用；费用承担与平台付费上限文档 | 各平台 OAuth/API 配置及账号授权另行完成，工具数量不代表全部已联调 |

## 复现与接续

```sh
pnpm --filter @remotearc/ui test:arc-experience
pnpm --filter @remotearc/ui typecheck
pnpm build:ui
pnpm test:saas
pnpm saas:apps
pnpm arc:setup
```

最后一个命令仅演练配置流程，不调用供应商、不写入 Secrets。完成代码发布及配置准备后，由所有者在自己的终端执行：

```sh
pnpm arc:setup --configure
```

这个命令会验证平台凭证、注册或复用 Stripe Webhook，并最后写入激活 Secret。**激活会改变已部署 Worker 的开放状态**，因此应在实际准备好开放 Arc 时才执行。无需重新开发支付或模型接入，不等于可以省略真实支付、退款、模型执行与用户授权验证。生产发布仍经过 master 精确提交 CI、备份、迁移及既有人工审批。

详细操作：[Arc 平台配置与上线](./arc-platform-launch.md)。费用分类：[Apps 工具覆盖](./apps-tool-coverage.md)。产品建议及来源：[产品方向复核](./product-direction-review-2026-10-19.md)。

早期商业化路线图和 Model Gateway 文档已标注其历史范围，并链接到当前配置说明；不要把旧的 Workers AI Auto、只读试点或高价模型分层建议当作本次 Arc Chat 的运行设置。[四家竞品定价研究](./agent-pricing-research.md)保留资料日期和独立的计量单位说明。

## 建议的下一轮

先用现有 MCP 用户验证一个可重复交付的工作闭环：从 Apps 获取上下文，在适合的自有电脑上执行，检查产物并回写结果。优先检验开发发布与周期报表两个候选场景；它们尚不是已确定的垂直市场。访谈与设计伙伴测试先形成重复使用、人工介入、单次完整成本及付款意愿的证据，再决定推广定位和正式套餐。当前代码不因这份研究改成新的工作流表单产品，也不自动放开 Arc。
