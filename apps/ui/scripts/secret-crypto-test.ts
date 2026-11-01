// The Dashboard page seals a one-time secret in the browser; the extension
// and the Go Agent open it. This proves the page's format with WebCrypto, the
// way the extension decrypts. packages/execution-core/secrets opens the same
// fixed vector in Go.
import assert from "node:assert/strict";
import { normalizeSecret, sealSecret } from "../src/features/secrets/secret-crypto.js";

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
async function open(privateKey: CryptoKey, handle: string, sealed: { epk: string; iv: string; ciphertext: string }) {
  const epk = await subtle.importKey("raw", Buffer.from(sealed.epk, "base64url"), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ikm = await subtle.importKey("raw", await subtle.deriveBits({ name: "ECDH", public: epk }, privateKey, 256), "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: encoder.encode("remote-arc one-time secret v1 " + handle) }, ikm, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(sealed.iv, "base64url"), additionalData: encoder.encode(handle) }, key, Buffer.from(sealed.ciphertext, "base64url")));
}

const device = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
const publicKey = Buffer.from(await subtle.exportKey("raw", device.publicKey)).toString("base64url");
const handle = "sec_abcdefghijklmnopqrstuvwx";
const sealed = await sealSecret(publicKey, handle, "sk-live-0123");
assert.deepEqual(Object.keys(sealed).sort(), ["ciphertext", "epk", "iv"]);
assert.equal(sealed.epk.length, 87);
assert.equal(sealed.iv.length, 16);
assert.equal(JSON.stringify(sealed).includes("sk-live"), false, "only ciphertext leaves the page");
assert.equal(await open(device.privateKey, handle, sealed), "sk-live-0123");
await assert.rejects(open(device.privateKey, "sec_zzzzzzzzzzzzzzzzzzzzzzzz", sealed), "a value sealed for one request does not open for another");
assert.notEqual((await sealSecret(publicKey, handle, "sk-live-0123")).ciphertext, sealed.ciphertext, "every seal uses a fresh key and IV");
assert.equal(normalizeSecret("  sk-live-0123\n"), "sk-live-0123", "whitespace from a paste is dropped");

// The fixed vector the Go Agent test opens, opened here with the same key.
const d = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64url");
const fixedPublic = Buffer.from("BFFcPW6545a5BNP-yn9U_c0MwemXvzddylFa0KbDtANfRTa-OlDzGPv5pUdZAqIhUCvvDVfgjFOyzApW8X2fk1Q", "base64url");
const fixed = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", d, x: fixedPublic.subarray(1, 33).toString("base64url"), y: fixedPublic.subarray(33).toString("base64url") }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
assert.equal(await open(fixed, "sec_vectorvectorvectorvector", {
  epk: "BGpl-hfWGDvQ7XuF33rgOJYdBAElGggVAyH4h9esUK_2oo0g6i_V4AZvn7SY-tG86JaIFD929pSNVuRSChD_hd8",
  iv: "vwn8pf_M6BrWMv07",
  ciphertext: "9LeBF4Cb3zw0QxHzwl8sxXRvaOEq6OaTTgxsyjDrvGFsuDvr",
}), "browser-sealed-value");
console.log("PASS: the Dashboard seals one-time secrets in a format WebCrypto and the Go Agent open");
