import { callDevice } from "../devices/device-call.js";

// All public MCP browser names, including cached aliases, share this boundary.
// This is server-owned policy, not an argument or a new Dashboard permission.
// The existing Agent/extension policy gate refuses fills on older clients that
// cannot enforce it. Internal Dashboard execution keeps its existing policy.
export async function callPublicBrowserDevice(
  env: Parameters<typeof callDevice>[0],
  identity: Parameters<typeof callDevice>[1],
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const { include_captcha_images: _images, ...ordinaryArgs } = args;
  try {
    return await callDevice(env, identity, deviceId, tool, ordinaryArgs,
      undefined, undefined, { browserAuthentication: "user" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("BROWSER_AUTH_REQUIRED:")) {
      throw new Error("BROWSER_AUTH_REQUIRED: complete the site's authentication in the browser, then resume the same task. Public MCP tools cannot fill OTP or CAPTCHA answers; changing Dashboard approval does not enable them here.");
    }
    throw error;
  }
}
