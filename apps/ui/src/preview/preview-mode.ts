// Read by production modules to branch on the UI preview build. Keep this
// module free of fixtures: preview.ts and its catalogs load only in preview.
export const UI_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";
