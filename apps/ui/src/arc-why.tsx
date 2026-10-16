type ArcWhyProps = {
  tr: (en: string, zh: string) => string;
  connectHref: string;
  earlyAccessHref: string;
};

export function ArcWhy({ tr, connectHref, earlyAccessHref }: ArcWhyProps) {
  const reasons = [
    { title: tr("Manage your device fleet.", "集中管理你的设备集群。"), detail: tr("Bring Windows, macOS and Linux into one device view. Work with the projects, installed tools and environments already on your computers.", "把 Windows、macOS 和 Linux 放进同一个设备视图，沿用电脑里已有的项目、软件和运行环境。"), status: tr("CONNECT · AVAILABLE TODAY", "CONNECT · 现已可用") },
    { title: tr("Set the rules on each machine.", "每台电脑，都有自己的执行边界。"), detail: tr("Choose tools and file-write locations per device, review activity, and pause or revoke access. Terminal access is a separate permission.", "按设备选择工具、限定文件写入目录、审阅操作记录，并随时暂停或撤销访问。终端权限单独授予。"), status: tr("CONNECT · AVAILABLE TODAY", "CONNECT · 现已可用") },
    { title: tr("Build teammates around repeatable work.", "围绕长期工作，创建你的 AI 队友。"), detail: tr("Arc Hosted is being designed to bring reusable Skills, Routines, review checkpoints and model budgets into a dedicated teammate workspace.", "Arc Hosted 正在围绕可复用 Skills、持续 Routines、审核节点和模型预算，打造专门的 AI 队友工作空间。"), status: tr("ARC HOSTED · IN DEVELOPMENT", "ARC HOSTED · 开发中") },
  ];
  const devices = [
    { brand: "windows", name: "Windows", task: tr("Run the existing test suite", "运行项目已有的测试"), folder: "~/projects/release" },
    { brand: "macos", name: "macOS", task: tr("Check the build artifacts", "检查构建产物"), folder: "~/work/release" },
    { brand: "linux", name: "Linux", task: tr("Collect the service logs", "收集服务日志"), folder: "~/services/app" },
  ];
  return <section className="arcWhy" id="why-arc" aria-labelledby="arcWhyTitle">
    <header className="arcWhyIntro">
      <span className="arcV3Eyebrow">{tr("WHY ARC", "为什么选择 ARC")}</span>
      <h2 id="arcWhyTitle">{tr("Already use ChatGPT? Here’s where Arc fits.", "ChatGPT 已经很好用，为什么还需要 Arc？")}</h2>
      <p>{tr("ChatGPT already connects apps such as GitHub and email, uses tools and carries out multi-step work. Keep using it for the work it handles well. Arc is being built for people who want a dedicated place to manage their own device fleet and AI teammates.", "ChatGPT 已经能连接 GitHub、邮箱，使用工具并完成多步骤工作。如果它已经能完成你的任务，继续用它就好。Arc 面向的是希望把自己的设备集群和 AI 队友，组织成专门工作环境的人。")}</p>
      <strong className="arcWhyThesis">{tr("Your machines. Your working rules. Your choice of AI.", "设备归你，规则由你设定，AI 由你选择。")}</strong>
    </header>
    <div className="arcWhyFocus">
      <ol className="arcWhyReasons">{reasons.map((reason, index) => <li key={reason.title}><span className="arcWhyReasonNumber">0{index + 1}</span><div><span className="arcWhyAvailability">{reason.status}</span><h3>{reason.title}</h3><p>{reason.detail}</p></div></li>)}</ol>
      <figure className="arcWhyExample">
        <figcaption><span>{tr("ONE RELEASE · YOUR OWN COMPUTERS", "一次发布 · 你自己的多台电脑")}</span><small>{tr("ILLUSTRATION", "场景示意")}</small></figcaption>
        <div className="arcWhyRequest"><span className="arcWhyGithub"><img src="/app-brands/github.svg" alt="" width="23" height="23" /></span><div><span>{tr("START WITH THE RELEASE ISSUE", "从发布 ISSUE 开始")}</span><p>{tr("“Run this project’s checks on my Windows PC and Mac. Collect the logs and leave a release checklist for review.”", "「在我的 Windows 和 Mac 上运行项目检查，收集日志，整理发布清单给我审核。」")}</p></div></div>
        <div className="arcWhyDeviceList">{devices.map(device => <div className="arcWhyDevice" key={device.brand}><span className="arcWhyPlatform"><img src={"/platform-brands/" + device.brand + ".svg"} alt="" width="25" height="25" /></span><div><strong>{device.name}</strong><span>{device.task}</span></div><code>{device.folder}</code></div>)}</div>
        <div className="arcWhyResult"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6" /></svg><div><strong>{tr("One reviewable release report", "汇成一份可审核的发布报告")}</strong><span>{tr("Checks, logs, artifacts and the next decision.", "检查结果、日志、产物，以及下一步决策。")}</span></div></div>
        <p className="arcWhyExampleScope">{tr("Concept workflow. Connect’s authorized device tools are available today; Arc Hosted coordination and app integrations are in development.", "流程概念示意。Connect 的授权设备工具现已可用；Arc Hosted 的调度与应用集成仍在开发。")}</p>
      </figure>
    </div>
    <div className="arcWhyChoose">
      <h3>{tr("Choose the setup that fits your work.", "按你的工作方式来选择。")}</h3>
      <div className="arcWhyOptions">
        <article className="arcWhyOption" aria-labelledby="arcWhyChatgpt"><span className="arcWhyOptionLabel">{tr("KEEP YOUR EXISTING SETUP", "沿用现有工具")}</span><h4 id="arcWhyChatgpt">ChatGPT</h4><p>{tr("Your existing apps, tools and tasks already cover the job. You don’t need to switch just to connect another app.", "现有应用、工具和任务已经足够完成工作，不必为了再连接一个应用而更换平台。")}</p><a href="https://learn.chatgpt.com/docs/use-chatgpt" target="_blank" rel="noreferrer">{tr("ChatGPT’s capabilities", "查看 ChatGPT 的能力")} ↗</a></article>
        <article className="arcWhyOption" aria-labelledby="arcWhyConnect"><span className="arcWhyOptionLabel">{tr("AVAILABLE TODAY", "现已可用")}</span><h4 id="arcWhyConnect">Remote Arc Connect</h4><p>{tr("Keep ChatGPT, Claude or another compatible AI. Add a device layer for approved tools across your own computers.", "保留 ChatGPT、Claude 等兼容 AI，通过同一个设备层调用多台电脑上已授权的工具。")}</p><a href={connectHref}>{tr("Connect your existing AI", "连接你现有的 AI")} ↗</a></article>
        <article className="arcWhyOption" aria-labelledby="arcWhyHosted"><span className="arcWhyOptionLabel">{tr("IN DEVELOPMENT", "开发中")}</span><h4 id="arcWhyHosted">Arc Hosted</h4><p>{tr("You want a dedicated home for AI teammates, reusable workflows, device coordination, approvals and model budgets. Hosted model use will have separate pricing and limits.", "你希望为 AI 队友、可复用工作流、设备调度、审批与模型预算，建立一个专门的工作空间。托管模型将有独立费用和额度。")}</p><a href={earlyAccessHref}>{tr("Follow Arc’s development", "关注 Arc 的进展")} ↗</a></article>
      </div>
    </div>
    <p className="arcWhyContext">{tr("These products have overlapping capabilities. Arc’s focus is the working environment above; actual availability depends on the product and plan.", "这些产品的能力存在重叠。Arc 聚焦的是上述工作环境，具体可用能力取决于产品与套餐。")} <a href="https://learn.chatgpt.com/docs/dots/computers-and-apps" target="_blank" rel="noreferrer">{tr("OpenAI’s current computer and app documentation", "OpenAI 当前的电脑与应用文档")} ↗</a></p>
  </section>;
}
