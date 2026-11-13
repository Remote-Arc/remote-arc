import { useEffect, useState } from "react";
import { useI18n } from "../hooks/use-i18n.js";
import { recoverAdminBrowser } from "../features/admin/admin-client-recovery.js";
import { PRODUCT_SW } from "../config/pwa-config.js";
import { isProductHost } from "../config/hosts.js";
import { ProductIcon as Icon } from "../components/product-icon.js";
import "../styles/app/product-pwa.css";

type InstallPrompt = Event & { prompt(): Promise<{ outcome: "accepted" | "dismissed" }> };
let pendingPrompt: InstallPrompt | null = null;
let listening = false;
export async function registerProductPwa(preview: boolean) {
  if (preview || location.protocol !== "https:" || !isProductHost(location.hostname)) return;
  if (!listening) {
    listening = true;
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      pendingPrompt = event as InstallPrompt;
      window.dispatchEvent(new Event("arc-install-ready"));
    });
    window.addEventListener("appinstalled", () => {
      pendingPrompt = null;
      window.dispatchEvent(new Event("arc-install-ready"));
    });
  }
  if (!("serviceWorker" in navigator)) return;
  if (location.hostname === "admin.remotearc.app" && (await recoverAdminBrowser())) return;
  try {
    await navigator.serviceWorker.register(PRODUCT_SW, { scope: "/", updateViaCache: "none" });
  } catch {
    /* Installation is optional; the online workspace stays available. */
  }
}

export function ProductInstall({ admin = false }: { admin?: boolean }) {
  const { tr } = useI18n();
  const [ready, setReady] = useState(Boolean(pendingPrompt)),
    [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  useEffect(() => {
    const update = () => {
      setReady(Boolean(pendingPrompt));
      setInstalled(
        matchMedia("(display-mode: standalone)").matches ||
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      );
    };
    window.addEventListener("arc-install-ready", update);
    const display = matchMedia("(display-mode: standalone)");
    display.addEventListener("change", update);
    return () => {
      window.removeEventListener("arc-install-ready", update);
      display.removeEventListener("change", update);
    };
  }, []);
  async function install() {
    if (!pendingPrompt) {
      setHelp((value) => !value);
      return;
    }
    const event = pendingPrompt;
    pendingPrompt = null;
    setReady(false);
    try {
      await event.prompt();
    } catch {
      setHelp(true);
    }
  }
  return (
    <div className="productInstall">
      <button
        type="button"
        disabled={installed}
        onClick={() => void install()}
        aria-expanded={help}
      >
        <Icon name={installed ? "check" : "device"} size={16} />
        {installed
          ? tr("app.productPwa.installedOnThisDevice")
          : ready
            ? tr("app.productPwa.installApp")
            : admin
              ? tr("app.productPwa.installAdminApp")
              : tr("app.productPwa.installRemoteArc")}
      </button>
      {help && <p role="status">{tr("app.productPwa.inChromeOrEdgeChooseInstall")}</p>}
    </div>
  );
}
