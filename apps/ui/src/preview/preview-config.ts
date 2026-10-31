export type PreviewConfigEnv = { ARC_PREVIEW_ENABLED?: string };
export function previewRuntimeConfig(env: PreviewConfigEnv, environment: "preview" | "development" = "preview") {
  return { version: 1, environment, arcAvailable: env.ARC_PREVIEW_ENABLED === undefined || env.ARC_PREVIEW_ENABLED === "1", billingAvailable: false, execution: "simulation" } as const;
}
