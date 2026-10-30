#!/usr/bin/env node
import { launchGo } from "./go-launcher.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--ts"))
    throw new Error(
      "The TypeScript runtime was retired. Remove --ts to run the Go Agent.",
    );
  return launchGo(args.filter((argument) => argument !== "--go"));
}
main().catch((error: unknown) => {
  process.stderr.write(
    "Remote Arc: " +
      (error instanceof Error ? error.message : String(error)) +
      "\n",
  );
  process.exitCode = 1;
});
