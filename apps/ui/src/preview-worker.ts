import { previewRuntimeConfig, type PreviewConfigEnv } from "./preview-config.js";
import {serveDemoMedia,type DemoMediaBucket} from "../../relay/src/demo-media.js";
type PreviewEnv = PreviewConfigEnv & {
  PUBLIC_MEDIA?: DemoMediaBucket;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

const isSpaNavigation = (request: Request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = new URL(request.url);
  const segment = url.pathname.split("/").filter(Boolean).pop() || "";
  return !segment.includes(".");
};

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    if(new URL(request.url).pathname.startsWith("/media/demo-gallery/"))return serveDemoMedia(request,env.PUBLIC_MEDIA);
    if (new URL(request.url).pathname === "/api/runtime-config") {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, {status:405, headers:{allow:"GET, HEAD"}});
      const response = Response.json(previewRuntimeConfig(env), {headers:{"cache-control":"no-store"}});
      return request.method === "HEAD" ? new Response(null, response) : response;
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || !isSpaNavigation(request)) {
      return asset;
    }

    const indexUrl = new URL("/", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
