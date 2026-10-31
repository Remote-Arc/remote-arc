import assert from "node:assert/strict";
import { atComputerLimit, pairingFailureMessage } from "../src/features/auth/pairing-errors.js";

const en = (text: string) => text;
const zh = (_: string, text: string) => text;
const computers = { error: "device_limit_reached", limit: 2, device_type: "computer" };

assert.equal(atComputerLimit(computers), true);
assert.equal(atComputerLimit({ error: "device_limit_reached", limit: 20, device_type: "browser" }), false);
assert.equal(atComputerLimit({ error: "pairing_changed" }), false);

for (const failure of [
  computers,
  { error: "device_limit_reached", limit: 20, device_type: "browser" },
  { error: "device_registration_rate_limited", limit: 20 },
  { error: "pairing_changed" },
  { error: "Pairing is no longer pending" },
]) {
  for (const tr of [en, zh]) {
    const message = pairingFailureMessage(failure, tr);
    assert.ok(message.length > 20, "A person gets a sentence");
    assert.doesNotMatch(message, /device_limit_reached|device_registration_rate_limited|pairing_changed|no longer pending/, "Internal codes never reach the page");
  }
}
assert.match(pairingFailureMessage(computers, en), /limit of 2 computers/);
assert.match(pairingFailureMessage(computers, zh), /2 台电脑/);
assert.equal(pairingFailureMessage({ error: "Pairing code not found" }, en), "Pairing code not found");
assert.equal(pairingFailureMessage({}, en), "Could not approve device");
console.log("PASS: pairing failures are readable in both languages and never expose internal codes");
