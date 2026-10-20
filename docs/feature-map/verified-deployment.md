# Verify an exact deployment's readiness

Owner: Remote Arc. Version: 1.0.0. Skill: arc-verified-deployment.

Entrance: Arc Chat → Verified task → Verify deployment readiness. Choose a connected Vercel Account, exact Deployment ID and optional team ID, then Run verification. No deployment is selected implicitly from a different project/account.

Preconditions: active Arc access, current usage allowance and provider read access to that deployment/team. No device is required. The run may call only deployments.get for this exact scope, plus relevant skill/schema reading.

Verification: the actual response ID must match, state must be READY and a valid HTTPS deployment URL must be returned. ERROR/cancellation fails; BUILDING, missing state or missing evidence remains pending. The receipt refers to the observation time and provider result.

Scope: provider readiness is not an application health, migration, domain or customer-traffic test. Those require their own acceptance checks. This scope cannot redeploy, change settings or roll back.

Recovery: retain observed state and URL after a failed/unfinished deployment. Report the remaining check. Do not promise unconfigured background monitoring. Account revocation or a disconnected provider cannot be treated as a successful readiness result.

Drive by the dialog's labels and inspect Execution receipt for the READY check, evidence ID/time and deployment URL. Confirm that a BUILDING fixture remains pending even if the assistant says it is ready.

Regression: arc-verification-test.ts covers READY, BUILDING, ERROR, wrong ID and unsafe URLs through real App dispatch with synthetic HTTP.

