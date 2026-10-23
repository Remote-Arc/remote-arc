# Security & access

The Connections navigation in the Connect workspace opens `/dashboard/connect/security`.
The mobile Connect bar offers the same destination.
This single page contains pending approvals, saved permissions, grouped OAuth
client authorizations, device access and recent audit events. BYO AI client
installation remains in the Connect workspace.

OAuth authorizations retain their individual grant identity, scopes, initial
authorization time, last token issuance, access expiry and refresh expiry.
Disconnecting one grant does not unpair a device or disconnect other grants.
Raw tokens and device credentials are never displayed.

## Approval choices

- **Allow once:** the exact request and arguments; consumed after success.
- **Allow 10 min:** file writes/edits to the approved path and tool for ten
  minutes from the decision. Browser scope changes do not offer this option.
- **Always allow:** persists until revoked. File approvals bind to the tool
  and exact path while permitting later content changes. Browser approvals
  bind to the exact request hash, task and sites; adding sites or changing
  the task or arguments requires another approval.
- **Deny:** the request is not authorized.

All choices bind to the owner, device, OAuth client and specific OAuth grant.
Persistent permissions add no device-wide Trusted Write Locations. Device tool
settings, MCP pause, OAuth revocation and local sensitive-file protection still
apply. Revocation blocks future calls; it does not stop an already dispatched
operation. The existing terminal folder-trust option remains supported.

`GET /api/approvals` lists live pending requests. `POST
/api/approvals/:id/decision` records the choice (`allow_always` for persistent
permission). `GET /api/approvals/permissions` lists saved permissions and `POST
/api/approvals/:id/revoke` revokes one. These endpoints require an owner session.
Persistent rows use the existing approval table with `approved_until = NULL`
and survive expiry maintenance. No schema or device-agent update is required.

## Identity pages

The server-rendered sign-in and verification screens share the neutral dark
palette, including fields, focus rings and error states. Their first HTML paint
is dark without a client-side theme switch. Google/email form destinations,
CSRF protection and authentication remain unchanged.

## Validation

- Relay approval broker tests exercise repeated persistent dispatch, maintenance,
  owner/device/client/grant/tool/path isolation, exact browser scope, revocation,
  one-time consumption and read-only polling using migrated SQLite.
- UI security tests validate response identities and saved-permission parsing.
- Browser checks cover desktop/mobile entry points, long paths, permission
  duration choices, nested client credential timestamps, neutral light/dark
  panels and actual server-rendered sign-in/verification HTML.
