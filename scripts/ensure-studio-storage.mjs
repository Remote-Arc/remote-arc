import { pathToFileURL } from "node:url";

const bucket = "remote-arc-studio-private";
/** Provision only the private bucket; never enable public access or modify existing buckets. */
export async function ensureStudioStorage({
  token,
  accountId,
  fetcher = fetch,
}) {
  if (!token || !/^[a-f0-9]{32}$/.test(accountId || ""))
    throw Error(
      "Studio storage requires the existing Cloudflare deployment credential and account ID.",
    );
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    headers = {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    };
  const check = await fetcher(`${base}/${bucket}`, { headers });
  const verifyPrivate = async () => {
    const responses = await Promise.all(
      ["managed", "custom"].map((kind) =>
        fetcher(`${base}/${bucket}/domains/${kind}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        }),
      ),
    );
    if (responses.some((response) => !response.ok))
      throw Error(
        "Cannot verify Studio bucket privacy; production promotion stopped.",
      );
    const [managed, custom] = await Promise.all(
      responses.map((response) => response.json()),
    );
    if (
      managed.success !== true ||
      managed.result?.enabled !== false ||
      custom.success !== true ||
      !Array.isArray(custom.result?.domains) ||
      custom.result.domains.some((domain) => domain.enabled !== false)
    ) {
      throw Error(
        "Studio bucket has public access or unverified domain settings; production promotion stopped. No public settings were changed.",
      );
    }
  };
  const verify = async (response) => {
    const payload = await response.json();
    if (
      !response.ok ||
      payload.success !== true ||
      payload.result?.name !== bucket
    )
      throw Error(
        "Unable to verify private Studio storage. Check the deployment credential has R2 Storage Edit permission.",
      );
    await verifyPrivate();
    return { bucket, created: false };
  };
  if (check.ok) return verify(check);
  if (check.status !== 404)
    throw Error(
      "Cannot inspect Studio storage. Existing credential needs R2 Storage Edit permission; no other storage was changed.",
    );
  const created = await fetcher(base, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: bucket }),
  });
  if (created.status === 409)
    return verify(await fetcher(`${base}/${bucket}`, { headers }));
  await verify(created);
  return { bucket, created: true };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await ensureStudioStorage({
      token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
    console.log(
      `Studio private storage ${result.created ? "created" : "verified"}: ${result.bucket}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
