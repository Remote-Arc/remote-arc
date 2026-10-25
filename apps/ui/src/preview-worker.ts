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


async function previewDemoMedia(request:Request,env:PreviewEnv):Promise<Response>{
  const response=await serveDemoMedia(request,env.PUBLIC_MEDIA);
  if(response.status!==503)return response;
  // serveDemoMedia has already validated the asset allowlist and GET/HEAD.
  // Some ephemeral previews omit R2 bindings. Reuse the published public files.
  const headers=new Headers();
  for(const name of ['range','if-none-match','if-range']){
    const value=request.headers.get(name);if(value)headers.set(name,value);
  }
  try{
    return await fetch(new URL(new URL(request.url).pathname,'https://remotearc.app'),{
      method:request.method,headers,redirect:'error',
    });
  }catch{
    return new Response('Media temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
  }
}

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    if(new URL(request.url).pathname.startsWith("/media/demo-gallery/"))return previewDemoMedia(request,env);
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
