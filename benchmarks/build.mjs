import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {root} from "./lib.mjs";
await fs.mkdir(path.join(root, "benchmarks/.bin"), {recursive:true});
const binary = path.join(root, "benchmarks/.bin/go-core" + (process.platform === "win32" ? ".exe" : ""));
const built = spawnSync("go", ["build", "-o", binary, "./cmd/benchcore"], {cwd:path.join(root, "apps/agent"), stdio:"inherit", windowsHide:true});
if (built.error || built.status !== 0) throw built.error ?? new Error("Go benchmark build failed");
console.log("Core benchmark worker built from current source.");
