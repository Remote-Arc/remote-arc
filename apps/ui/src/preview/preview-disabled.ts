// Stand-in for preview.ts in production builds (aliased in vite.config.ts).
// It keeps the same export so main.tsx installs the mock unconditionally and
// only preview builds pay for the fixtures.
export function installUiPreviewFetchMock(_mcpEndpoint: string): void {}
