import React from "react";
import { trackProductEvent } from "../../lib/product-events.js";

type Props = { children: React.ReactNode; tr: (en: string, zh: string) => string };
type State = { failed: boolean };

// Keep a malformed or temporarily unavailable task from unmounting the entire dashboard.
export class ConnectTasksErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    trackProductEvent("client.runtime.failed", { errorCode: "CONNECT_TASKS_RENDER_ERROR" });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { tr } = this.props;
    return (
      <section className="connectTasks" role="alert">
        <div className="connectTasksNotice">
          <div>
            <h2>{tr("Tasks couldn't be displayed", "任务页面暂时无法显示")}</h2>
            <p>{tr("Your saved tasks have not been changed. Reload to restore this view.", "已保存的任务没有被修改。重新加载页面即可恢复查看。")}</p>
          </div>
          <button type="button" className="ghostButton" onClick={() => window.location.reload()}>
            {tr("Reload page", "重新加载页面")}
          </button>
        </div>
      </section>
    );
  }
}
