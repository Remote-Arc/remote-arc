type FeatureFlags = { arcAvailable?: boolean };

export function should(feature: keyof FeatureFlags, flags: FeatureFlags | null | undefined) {
  return flags?.[feature] === true;
}
