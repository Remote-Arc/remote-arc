import React from "react";
import type { Translate } from "../locales/locale-catalog.js";
import { useI18n } from "../hooks/use-i18n.js";
import { trackProductEvent } from "../lib/product-events.js";
import { isStaleBuildError, reloadForStaleBuild } from "../lib/stale-build-recovery.js";

type Props = { children: React.ReactNode; tr: Translate };
type State = { failed: boolean; reloading: boolean };

/** Last line of defence for the whole app: a render error, or a lazy view that
 * could not load, shows a reload prompt instead of an empty page. */
class AppErrorBoundaryView extends React.Component<Props, State> {
  state: State = { failed: false, reloading: false };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const stale = isStaleBuildError(error);
    trackProductEvent("client.runtime.failed", {
      errorCode: stale ? "CLIENT_STALE_BUILD" : "CLIENT_RENDER_ERROR",
    });
    if (stale && reloadForStaleBuild()) this.setState({ reloading: true });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { tr } = this.props;
    return (
      <main className="appErrorBoundary" role="alert" aria-busy={this.state.reloading}>
        <h1>{tr("app.appErrorBoundary.thisPageNeedsARefresh")}</h1>
        <p>{tr("app.appErrorBoundary.remoteArcWasUpdatedOrPart")}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {tr("app.appErrorBoundary.reloadPage")}
        </button>
      </main>
    );
  }
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const { tr } = useI18n();
  return <AppErrorBoundaryView tr={tr}>{children}</AppErrorBoundaryView>;
}
