/** Optional footage providers are separate from storyboard models and final rendering.
 * No provider is enabled by declaring these contracts. A production integration must
 * persist dispatch intent, reserve its own usage, and import bytes into private assets.
 */
export type StudioVideoRequest = {
  requestId: string;
  ownerId: string;
  projectId: string;
  sceneId: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  referenceAssetIds: string[];
};
export type StudioVideoOutcome =
  | { state: "queued" | "running"; providerJobId: string }
  | { state: "completed"; providerJobId: string; outputAssetId: string }
  | {
      state: "failed" | "unknown" | "cancelled";
      providerJobId: string;
      code: string;
    };
export interface StudioVideoProvider {
  id: string;
  capabilities: {
    durations: number[];
    aspectRatios: StudioVideoRequest["aspectRatio"][];
    referenceImages: boolean;
    cancellation: boolean;
  };
  submit(request: StudioVideoRequest): Promise<StudioVideoOutcome>;
  poll(ownerId: string, providerJobId: string): Promise<StudioVideoOutcome>;
  cancel?(ownerId: string, providerJobId: string): Promise<StudioVideoOutcome>;
}
/** A model's completion is an asset, never a replacement for an entire project. */
export const STUDIO_PROVIDER_BOUNDARIES = {
  storyboard: "validated-scene-document",
  footage: "private-video-asset",
  render: "deterministic-mp4",
} as const;
