const releases = "https://github.com/Remote-Arc/remote-arc/releases";
const manifestUrl = releases + "/latest/download/go-binaries.json";

export async function handleMacAppDownload(request: Request, fetchRelease: typeof fetch = fetch): Promise<Response> {
  const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
  const match = new URL(request.url).pathname.match(/^\/api\/downloads\/macos(?:\/(amd64|arm64))?$/);
  if (!match) return new Response(null,{status:404,headers});
  try {
    const response = await fetchRelease(releases+'/latest/download/macos-apps.json',{
      cache:'no-store',headers:{'cache-control':'no-cache',accept:'application/json'},signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('Mac package unavailable');
    const manifest = await response.json() as {version?:unknown;notarized?:unknown;minimumMacOS?:unknown;artifacts?:Record<string,{filename?:unknown;sha256?:unknown}>};
    if(typeof manifest.version!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)||manifest.version.length>30||manifest.notarized!==true||manifest.minimumMacOS!=='13.0') throw Error('Invalid Mac release');
    for(const arch of ['amd64','arm64']) {
      const entry = manifest.artifacts?.[arch];
      if(entry?.filename!==`RemoteArc-v${manifest.version}-macos-${arch}.dmg`||typeof entry.sha256!=='string'||!/^[a-f\d]{64}$/i.test(entry.sha256))throw Error('Invalid Mac artifact');
    }
    if(!match[1]) return Response.json({available:true,version:manifest.version,minimumMacOS:manifest.minimumMacOS},{headers});
    return new Response(null,{status:302,headers:{...headers,
      location:`${releases}/download/remotelink-v${manifest.version}/RemoteArc-v${manifest.version}-macos-${match[1]}.dmg`,
      'x-remotearc-agent-version':manifest.version,
    }});
  } catch {
    if(!match[1]) return Response.json({available:false},{headers});
    return new Response('A signed Mac download is not available. Visit https://remotearc.app/downloads for the curl installer.',{status:503,headers:{...headers,'retry-after':'30'}});
  }
}

// Keep download links independent of the website's build-time release version.
export async function handleAgentDownload(request: Request, fetchRelease: typeof fetch = fetch): Promise<Response> {
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
  const target = new URL(request.url).pathname.match(/^\/api\/downloads\/agent\/(windows|darwin|linux)\/(amd64|arm64)$/);
  if (!target) return new Response("Download target not found", { status: 404, headers });
  try {
    const response = await fetchRelease(manifestUrl, {
      cache: "no-store", headers: { "cache-control": "no-cache", accept: "application/json" }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Stable release unavailable");
    const manifest = await response.json() as { version?: unknown; checksums?: Record<string, unknown> };
    if (typeof manifest.version !== "string" || manifest.version.length > 30 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) throw new Error("Invalid stable release");
    const asset = `remotelink-v${manifest.version}-${target[1]}-${target[2]}${target[1] === "windows" ? ".exe" : ""}`;
    if (typeof manifest.checksums?.[asset] !== "string" || !/^[a-f\d]{64}$/i.test(manifest.checksums[asset] as string)) throw new Error("Release asset missing checksum");
    return new Response(null, { status: 302, headers: { ...headers,
      location: `${releases}/download/remotelink-v${manifest.version}/${asset}`, "x-remotearc-agent-version": manifest.version,
    } });
  } catch {
    return new Response("Unable to check the latest stable Agent. Please retry or visit https://github.com/Remote-Arc/remote-arc/releases/latest", {
      status: 503, headers: { ...headers, "content-type": "text/plain; charset=utf-8", "retry-after": "30" },
    });
  }
}
