# Apps 费用归属与接入方式

更新：2026-10-17。本文是平台运营分类，不是供应商价格报价；不在 Apps 卡片上增加费用类别徽标。具体金额、配额和访问资格以实际开发者控制台、连接账号合同及当前官方规则为准。未完成平台注册或真实账号试用，不代表应用已可连接。

## 分类规则

- **用户按量/资源**：API 凭证或资源归用户，按其 API 项目、生成积分、消息账单或云资源计费。
- **用户账号/套餐**：用户可能需要上游产品套餐、API 访问许可或组织管理员许可，不意味着每次调用单独计费。
- **平台项目/混合**：OAuth 应用、项目额度、API 费用、分发审核或安全评估可能由 Remote Arc 承担；用户自身 SaaS/广告费用仍独立。
- **平台固定运营**：所有集成都有 Remote Arc 的 Worker、D1、加密凭证保管、流量、审计、维护与支持成本。采用原生 API 而非 Composio/Lindy，消除的是代理服务依赖，不会让这些成本归零。

OAuth 决定谁授权账号，账单取决于凭证所属的项目及上游合同。自带 OAuth 开发者应用的企业模式目前尚未实现，不能用它解释现有平台费用。

## 当前 29 个应用

| 应用 | 当前连接方式 | 费用类别 | 归属与条件 |
| --- | --- | --- | --- |
| GitHub | OAuth | 用户账号/套餐 | 账号与组织 API 额度；仓库/Actions 等资源按用户账号规则。平台仍承担 OAuth 应用维护与分发责任。 |
| Slack | OAuth | 用户账号/套餐 | 工作区套餐和应用分发/Marketplace 限制分别处理；不能将新建个人 App 当作商业分发审核的替代。 |
| Gmail | OAuth | 平台项目/混合 | 用户邮箱账号；开发者 Cloud 项目额度，规模化 API 费用或受限 scope 安全审核成本可能由 Remote Arc 承担。 |
| Outlook | OAuth | 用户账号/套餐 | 用户 Microsoft 账号/租户权限和套餐；所用 Graph 端点的计量规则需单独核查，不能把所有 Graph API 归为免费。 |
| Google Calendar | OAuth | 平台项目/混合 | 用户日历账号；开发者项目额度，规模化调用可能产生项目侧费用。 |
| Outlook Calendar | OAuth | 用户账号/套餐 | 用户 Microsoft 账号/租户、日历权限及适用套餐。 |
| Google Drive | OAuth | 平台项目/混合 | 用户 Drive 账号/存储套餐；开发者项目 API 额度与规模化使用费用另算。 |
| Google Docs | OAuth | 平台项目/混合 | 用户文档账号/Workspace 权益；开发者项目 API 额度。不要从 OAuth 推断调用费用必由用户承担。 |
| Google Sheets | OAuth | 平台项目/混合 | 用户表格账号/Workspace 权益；开发者项目 API 额度及后续规则。 |
| Confluence | OAuth | 用户账号/套餐 | 用户 Atlassian 站点的套餐/产品权限和 API 速率限制；平台负责 OAuth 分发。 |
| Notion | OAuth | 用户账号/套餐 | 用户 Workspace 套餐、区块与连接速率限制；API 限额和 Workspace 限额是两套规则。 |
| Vercel | OAuth Integration 安装 | 用户按量/资源 | 用户选择账号/团队和项目；部署、计算、存储费用按其 Vercel 套餐。平台负责 Integration 客户端、权限和分发。 |
| Supabase | OAuth Management API | 用户按量/资源 | 用户选择授权组织，项目计算、数据库和存储按该组织套餐。平台 OAuth scopes 固定配置，本地只读仍阻止 SQL 写入。 |
| Linear | OAuth + PKCE | 用户账号/套餐 | 用户选择工作区；Workspace 套餐和 API 限额归用户。以授权用户身份执行，支持 refresh token。 |
| Jira | OAuth | 用户账号/套餐 | 用户 Atlassian 站点套餐、账号权限与 API 限额；不能读取未授权站点。 |
| WhatsApp Business | 用户 API 凭证 + Business 设置 | 用户按量/资源 | 消息费用按实际 WABA/Business 账单、消息类别与市场处理；当前不提供 Remote Arc 代付号码。公共商用流程另需 Meta Business/Embedded Signup 配置。 |
| YouTube | OAuth | 平台项目/混合 | 数据访问授予用户账号；YouTube Data API 日额度通常归开发者项目，扩容/审核是平台责任。 |
| Facebook | OAuth | 平台项目/混合 | 用户 Page/Business 权限；平台应用分发、权限审核和版本维护。是否计量收费以实际产品合同为准。 |
| Instagram | OAuth | 平台项目/混合 | 合格专业账号及关联 Page；平台需完成相关 Meta 权限与分发审核，不能支持任意个人账号。 |
| X | 平台托管 OAuth + PKCE | 平台项目/混合 | API 调用消耗 Remote Arc 的 X 开发者项目积分，与用户 X Premium 不同；平台必须明确配置资金和上限，不自动充值。 |
| LinkedIn | OAuth | 用户账号/套餐（访问资格待平台确认） | 用户账号及获批产品权限；平台开发者应用的产品准入/审核不等于用户付费订阅自动包含 API 访问。 |
| Runway | 用户 API Key | 用户按量/资源 | 用户 Runway Dev API 项目的生成积分；网页工作区和 API 项目不同，符合条件的组织可能支持积分转移。Remote Arc 不提供共享生成 Key。 |
| Google Search Console | OAuth | 平台项目/混合 | 用户站点授权；开发者项目/用户/API 额度需分别监测。 |
| Google Analytics | OAuth | 平台项目/混合 | 用户 Analytics Property 权限及套餐；Data/Admin API 项目与属性级额度按实际规则处理。 |
| Google Ads | OAuth + 平台 developer token | 平台项目/混合 | 广告支出属于用户广告账号；API developer token、访问级别与额度由平台负责。读取报表不等于购买广告。 |
| Meta Ads | OAuth | 平台项目/混合 | 广告支出属于连接的广告账号；平台承担开发者应用、Marketing API 权限审核与限额管理。 |
| Shopify | OAuth | 用户账号/套餐 | 店铺套餐、资源和受保护客户数据访问规则；当前操作创建商品草稿，不提供代购或代付。 |
| HubSpot | OAuth | 用户账号/套餐 | 用户 Portal 产品套餐和 API 限额；平台负责公有应用分发与 token 生命周期。 |
| Salesforce | OAuth | 用户账号/套餐 | 用户 Org 的 API 访问资格、Edition、日额度及额外许可；不是所有 Salesforce 账号都可直接启用 API。 |

## 重点费用来源

Runway 生成消耗 API 项目的积分，不自动复用普通网页订阅。符合条件的组织可在 API 项目与网页工作区之间转移积分，但需满足 Runway 的组织与账号条件。[API 计费](https://docs.dev.runwayml.com/guides/pricing/)、[组织积分转移](https://help.runwayml.com/hc/en-us/articles/55042248433939-API-projects-in-your-Organization-space)。

X API 按用量消耗开发者项目积分；采用谁的开发者项目，就需要核查谁承担账单。当前实现已改为 Remote Arc 托管 OAuth，因此调用费用归平台的 X 开发者项目；不会自动购买积分或自动充值。[X API 计费](https://docs.x.com/x-api/getting-started/pricing)。

Google Workspace 已公布 Gmail、Calendar、Drive 等 API 的项目配额调整及规模化计费方向；不能笼统写成永久免费，实际项目状态和收费启用时间需要在控制台确认。受限用户数据 scope 的审核或安全评估也可能产生平台成本。[Google Workspace 额度与计费说明](https://developers.google.com/workspace/tools-safety)。

WhatsApp Business Platform 按消息类别、市场和适用规则计算消息费用，实际付款方取决于 Business/WABA 账单安排。不要把个人 WhatsApp 网页登录和 Business API 接入视为同一个产品。[官方计费](https://business.whatsapp.com/products/platform-pricing)。

Notion 的 API 请求限制与 Workspace 套餐/区块限制分开。[请求限制](https://developers.notion.com/reference/request-limits)。Slack 公共商业分发需要核查 Marketplace 路径；创建开发 App 本身不等于可以向所有工作区开放。[分发与调用限制](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/)。

## 上线策略与复核

本期按负责人要求不将逐个真实账号联调设为生产代码发布前置条件。保留自动协议/SQLite/权限检查、受保护生产流程和真实配置状态；未注册客户端不显示可授权入口。发布后由负责人使用自己的账号试用；未试用的平台标记为未验证，不能宣传为 29 个全部验收通过。

当前 27 个应用采用托管 OAuth；Vercel、Linear、Supabase、X 已从原用户凭证方式升级，用户不需注册开发者应用。Runway 保留用户 API 密钥；WhatsApp Business 暂保留 Business 凭证及账号/号码选择，其完整 Embedded Signup 仍需平台接入与审核。调整接入方式时必须同步本表、注册生成器、运行时 scopes、费用归属和文档，尤其是 X 的开发者项目付款方。

上线前记录每个开发者项目是否启用计费、是否自动充值、访问级别、额度上限和告警负责人；不自动购买 API 积分、提高付费额度或开启自动充值。用户写入审批和提供商财务上限分别处理；审批一个写入不代表授权平台提高预算。Hosted Arc 模型推理的预算账本与 Apps 用量、Connect 工具调用额度独立。
