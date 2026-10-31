# Browser authentication

Complete sign-in, verification codes and CAPTCHAs in the task browser yourself, then resume the same task. Do not retrieve or pass authentication codes or CAPTCHA answers through model tools.

Authentication approval controls have been removed from all frontend workspaces, including Connect and Arc. Browser Runner notification preferences remain available behind the settings button next to `browser_runner` in device tool management.

The Relay issues `NO_BROWSER_AUTH` for every browser call, including internal Dashboard and Arc calls. Previously saved `browser_auth_permissions` records remain stored for compatibility but are ignored; model arguments cannot reactivate them. No data migration or Agent update is required for this server-side restriction to take effect after Relay deployment.

The legacy `/api/browser-auth/:deviceId` endpoint retains ownership checks, same-origin protection and revocation. GET returns disabled effective permissions. POST refuses new or restored approvals with HTTP 410 and `browser_auth_disabled`; posting the empty disabled policy can still clear an old record and records an audit event.

The Agent and extension retain their scoped authentication engine and redaction checks, but the Relay no longer supplies authority to use them. Returning this feature would require an explicit code and product decision; existing records or frontend settings cannot switch it back on.

Authentication blockers direct the user to complete the step in their browser. A final application, payment or post retains its separate submit authorization and deduplication.

Validation covers old stored grants, public and internal dispatch, rejected approval attempts, legacy revocation, ownership and same-origin protection. Lower-level synthetic OTP and CAPTCHA tests continue to exercise the retained engine without real accounts or applications.
