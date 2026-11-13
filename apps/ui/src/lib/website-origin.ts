import type { ProductHostnames } from "../config/hosts.js";

// vite.config.ts copies this function into the locale preloader with
// toString(), so it may use only its arguments: no imports or module values.
export function isWebsiteLocation(
  hostname: string,
  port: string,
  hosts: Pick<ProductHostnames, "marketing">,
) {
  return (
    hostname === "remotearc.app" ||
    hostname === hosts.marketing ||
    hostname === "www.remotearc.app" ||
    /^pr-[0-9]+-remote-arc-ui-preview[.]nzp[.]workers[.]dev$/.test(hostname) ||
    hostname === "remote-arc-video-gallery-preview.nzp.workers.dev" ||
    ((hostname === "localhost" || hostname === "127.0.0.1") && Boolean(port))
  );
}
