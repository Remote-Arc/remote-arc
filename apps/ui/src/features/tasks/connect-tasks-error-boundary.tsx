import type { Translate } from "../../locales/locale-catalog.js";
import React from "react";
import { trackProductEvent } from "../../lib/product-events.js";

type Props = { children: React.ReactNode; tr: Translate };
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
            <h2>{tr("tasks.connectTasksErrorBoundary.tasksCouldnTBeDisplayed")}</h2>
            <p>{tr("tasks.connectTasksErrorBoundary.yourSavedTasksHaveNotBeen")}</p>
          </div>
          <button type="button" className="ghostButton" onClick={() => window.location.reload()}>
            {tr("tasks.connectTasksErrorBoundary.reloadPage")}
          </button>
        </div>
      </section>
    );
  }
}
