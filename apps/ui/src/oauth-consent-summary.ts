export type ConsentGroup = {
  key: string;
  icon: string;
  title: string;
  titleZh: string;
  description: string;
  descriptionZh: string;
};

// Labels are presentation-only: the server still enforces the exact OAuth scopes.
export function summarizeConsentScopes(input: readonly string[]): ConsentGroup[] {
  const scopes = new Set(input);
  const groups: ConsentGroup[] = [];
  const has = (...items: string[]) => items.some(scope => scopes.has(scope));
  if (has("devices:read", "computer:read", "computer:write")) {
    const canWrite = scopes.has("computer:write");
    groups.push({
      key: "devices", icon: "⌘", title: "Use devices you allow", titleZh: "使用你允许的设备",
      description: canWrite
        ? "Find computers, read permitted files, edit files and run commands only where device permissions allow."
        : "Find linked computers and read permitted files or device status.",
      descriptionZh: canWrite
        ? "查找已连接电脑、读取允许的文件；仅能在设备开放对应权限时修改文件或运行命令。"
        : "查找已连接电脑，在设备允许范围内查看文件或设备状态。",
    });
  }
  if (has("browser:read", "browser:interact")) {
    const canInteract = scopes.has("browser:interact");
    groups.push({
      key: "browser", icon: "▣", title: "Use shared browser tabs", titleZh: "使用你共享的浏览器标签页",
      description: canInteract
        ? "Read shared pages and click or fill controls when your browser permissions allow."
        : "Read pages you choose to share through Remote Arc.",
      descriptionZh: canInteract
        ? "读取共享页面，并在浏览器权限和安全限制允许时点击或填写内容。"
        : "只读取你通过 Remote Arc 共享的浏览器页面。",
    });
  }
  if (has("apps:read", "apps:write")) {
    const canWrite = scopes.has("apps:write");
    groups.push({
      key: "apps", icon: "▦", title: "Use services you connect", titleZh: "使用你连接的应用服务",
      description: canWrite
        ? "Find your linked services, such as Slack. Changes still require service permissions and your approval."
        : "Find and read services you have separately connected.",
      descriptionZh: canWrite
        ? "查找你连接的 Slack 等服务。任何写入仍需服务权限和你的逐次审批。"
        : "查找、读取你独立授权的服务，不会自动连接新账号。",
    });
  }
  if (has("automation:read", "automation:write", "agent:write")) {
    const canAct = has("automation:write", "agent:write");
    groups.push({
      key: "automation", icon: "↻", title: "Manage ongoing tasks", titleZh: "管理持续运行的任务",
      description: canAct
        ? "Review and manage authorized tasks, including work that continues after this conversation."
        : "Check the status of tasks already set up in Remote Arc.",
      descriptionZh: canAct
        ? "查看并管理你允许的持续任务，部分任务可在聊天结束后继续运行。"
        : "查看 Remote Arc 中已有任务的运行状态。",
    });
  }
  if (scopes.has("offline_access")) {
    groups.push({
      key: "session", icon: "✓", title: "Stay connected", titleZh: "保持连接",
      description: "Use a renewable sign-in so you do not have to reconnect every hour; you can revoke access.",
      descriptionZh: "使用可刷新的登录状态，避免每小时重新连接；你可以撤销授权。",
    });
  }
  return groups;
}
