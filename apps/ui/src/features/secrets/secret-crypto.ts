// Encrypts a one-time secret in the user's browser to the P-256 key the
// device made for this one request: ECDH, then HKDF-SHA-256 bound to the
// handle, then AES-256-GCM with the handle as associated data. The Go Agent
// (packages/execution-core/secrets) and the browser extension open it.
const encoder = new TextEncoder();
const toB64 = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const SECRET_MIN_LENGTH = 4;
export const SECRET_MAX_LENGTH = 16 * 1024;

/** The value as it is sent: surrounding whitespace from a paste is removed. */
export function normalizeSecret(value: string) {
  return value.trim();
}

export async function sealSecret(publicKey: string, handle: string, value: string) {
  const subtle = globalThis.crypto.subtle;
  const device = await subtle.importKey("raw", fromB64(publicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const shared = await subtle.deriveBits({ name: "ECDH", public: device }, ephemeral.privateKey, 256);
  const ikm = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: encoder.encode("remote-arc one-time secret v1 " + handle) },
    ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(handle) }, key, encoder.encode(value));
  return { epk: toB64(await subtle.exportKey("raw", ephemeral.publicKey)), iv: toB64(iv), ciphertext: toB64(ciphertext) };
}
