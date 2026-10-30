import {
  ACCOUNT_PLAN_FEATURES,
  ACCOUNT_PLAN_LABELS,
  FREE_BINARY_BYTES_PER_MONTH,
  type AccountFeature,
  type AccountPlan,
} from "@remotearc/protocol";
import {billingEnabled,type PlatformLaunchEnv} from '../platform/platform-launch.js';
import {currentArcPlan} from '../arc/arc-plan.js';

export type { AccountFeature, AccountPlan };

export type PlanEntitlements = {
  plan: AccountPlan;
  features: ReadonlySet<AccountFeature>;
};

type EntitlementEnv = PlatformLaunchEnv & {
  DB: D1Database;
};

export const PLAN_LABELS = ACCOUNT_PLAN_LABELS;

export class PlanUpgradeRequiredError extends Error {
  readonly code = "PLAN_UPGRADE_REQUIRED";
  readonly required_plan: AccountPlan = "plus";

  constructor(readonly feature: AccountFeature) {
    super(`Remote Arc Plus is required for ${feature.replaceAll("_", " ")}.`);
    this.name = "PlanUpgradeRequiredError";
  }
}

export function isPlanUpgradeRequiredError(
  error: unknown,
): error is PlanUpgradeRequiredError {
  return (
    error instanceof PlanUpgradeRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "PLAN_UPGRADE_REQUIRED")
  );
}

export function normalizeAccountPlan(value: unknown): AccountPlan {
  return value === "plus" ? "plus" : "free";
}

export function planEntitlements(plan: AccountPlan): PlanEntitlements {
  return {
    plan,
    features: new Set(ACCOUNT_PLAN_FEATURES[plan]),
  };
}

export async function getAccountPlan(
  env: EntitlementEnv,
  userId: string,
): Promise<AccountPlan> {
  const row = await env.DB.prepare(
    `SELECT u.plan, u.role,
       EXISTS(
         SELECT 1 FROM plan_grants g
         WHERE g.user_id = u.id
           AND g.plan = 'plus'
           AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR g.expires_at > ?2)
       ) AS has_plus_grant
     FROM users u
     WHERE u.id = ?1
     LIMIT 1`,
  )
    .bind(userId, new Date().toISOString())
    .first<{ plan: string | null; role: string | null; has_plus_grant: number }>();

  if (!row) throw new Error("Account not found.");

  // Admin is an operational override; base plan and active grants share one
  // effective-plan calculation so billing/promo/workspace sources can coexist.
  if (row.role === "admin" || row.has_plus_grant) return "plus";
  if(billingEnabled(env)){
    const plan=await currentArcPlan(env,userId);
    // Only plans that include hosted models unlock hosted features.
    if(plan.allHostedModels)return 'plus';
    if(plan.id!=='free'&&normalizeAccountPlan(row.plan)!=='plus')return 'connect';
  }
  return normalizeAccountPlan(row.plan);
}

/** Free accounts have a published monthly binary transfer allowance; paid
 * plans, Plus grants and administrators are uncapped. */
export async function binaryTransferLimit(env: EntitlementEnv, userId: string) {
  return await getAccountPlan(env, userId) === "free" ? FREE_BINARY_BYTES_PER_MONTH : null;
}

export async function getAccountEntitlements(
  env: EntitlementEnv,
  userId: string,
): Promise<PlanEntitlements> {
  return planEntitlements(await getAccountPlan(env, userId));
}

export async function hasFeature(
  env: EntitlementEnv,
  userId: string,
  feature: AccountFeature,
) {
  return (await getAccountEntitlements(env, userId)).features.has(feature);
}

export function requireEntitledFeatures(
  entitlements: PlanEntitlements,
  features: readonly AccountFeature[],
) {
  for (const feature of new Set(features)) {
    if (!entitlements.features.has(feature)) {
      throw new PlanUpgradeRequiredError(feature);
    }
  }
  return entitlements;
}

export async function requireFeatures(
  env: EntitlementEnv,
  userId: string,
  features: readonly AccountFeature[],
) {
  return requireEntitledFeatures(
    await getAccountEntitlements(env, userId),
    features,
  );
}

export async function requireFeature(
  env: EntitlementEnv,
  userId: string,
  feature: AccountFeature,
) {
  return requireFeatures(env, userId, [feature]);
}
