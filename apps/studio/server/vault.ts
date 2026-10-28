import type { StudioServices } from "./ports.js";
/** AES-GCM with owner/project context; compatible with existing portable snapshots. */
export function studioVault(base64Key: string): StudioServices["vault"] {
  const encoder = new TextEncoder();
  const bytes = (value: string) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const base64 = (value: Uint8Array) => {
    let binary = "";
    for (let offset = 0; offset < value.length; offset += 8192)
      binary += String.fromCharCode(...value.subarray(offset, offset + 8192));
    return btoa(binary);
  };
  const raw = bytes(base64Key);
  if (raw.length !== 32) throw Error("STUDIO_VAULT_CONFIGURATION");
  const key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return {
    async seal(value, context) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
        await key,
        encoder.encode(JSON.stringify(value)),
      );
      return JSON.stringify({
        v: 1,
        iv: base64(iv),
        data: base64(new Uint8Array(data)),
      });
    },
    async unseal<T>(value: string, context: string): Promise<T> {
      const row = JSON.parse(value);
      if (row.v !== 1) throw Error("STUDIO_VAULT_FORMAT");
      const result = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(row.iv),
          additionalData: encoder.encode(context),
        },
        await key,
        bytes(row.data),
      );
      return JSON.parse(new TextDecoder().decode(result));
    },
  };
}
