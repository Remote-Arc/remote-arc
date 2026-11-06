export function isWebsiteLocation(hostname: string, port: string) {
  return (
    hostname === "remotearc.app" ||
    hostname === "www.remotearc.app" ||
    /^pr-[0-9]+-remote-arc-ui-preview[.]nzp[.]workers[.]dev$/.test(hostname) ||
    hostname === "remote-arc-video-gallery-preview.nzp.workers.dev" ||
    ((hostname === "localhost" || hostname === "127.0.0.1") && Boolean(port))
  );
}
