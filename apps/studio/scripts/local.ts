/** Development composition only. No account/Agent database, production bypass or paid models. */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { localD1 } from "../server/local-store.js";
import { handleStudio } from "../server/service.js";
import { studioVault } from "../server/vault.js";
import type { StudioEnvironment } from "../server/ports.js";

export function createStandaloneStudio(
  directory: string,
  origin = "http://127.0.0.1:4331",
) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(
    path.join(directory, "studio-independent.sqlite"),
  );
  db.exec("PRAGMA foreign_keys=ON");
  if (
    !db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='studio_projects'",
      )
      .get()
  )
    db.exec(
      readFileSync(
        new URL("../migrations/0001_studio.sql", import.meta.url),
        "utf8",
      ),
    );
  const keyPath = path.join(directory, "studio-vault.key");
  if (!existsSync(keyPath))
    writeFileSync(keyPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  const mediaPath = path.join(directory, "studio-assets");
  mkdirSync(mediaPath, { recursive: true });
  const file = (key: string) => {
    if (!/^studio\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(key))
      throw Error("STUDIO_ASSET_KEY");
    return path.join(mediaPath, key.replaceAll("/", "_"));
  };
  const env: StudioEnvironment = {
    DB: localD1(db),
    STUDIO_ORIGIN: origin,
    STUDIO_SERVICES: {
      identity: async () => ({
        id: "local-creator",
        name: "Local Creator",
        email: "local-creator@localhost",
      }),
      links: { login: "/auth/login", account: null, home: null },
      vault: studioVault(readFileSync(keyPath, "utf8")),
      skills: {
        list: async () => [],
        read: async () => {
          throw Error("STUDIO_SKILL_NOT_FOUND");
        },
      },
      storyboard: {
        catalog: () => ({ models: [], available: false }),
        generate: async () => {
          throw Error("STUDIO_AI_UNAVAILABLE");
        },
      },
    },
    STUDIO_MEDIA: {
      async put(key: string, data: ArrayBuffer | Uint8Array) {
        writeFileSync(file(key), new Uint8Array(data));
        return {};
      },
      async get(key: string) {
        if (!existsSync(file(key))) return null;
        const data = readFileSync(file(key));
        return { body: new Uint8Array(data), size: data.byteLength };
      },
      async delete(keys: string | string[]) {
        for (const key of typeof keys === "string" ? [keys] : keys) {
          if (existsSync(file(key))) unlinkSync(file(key));
        }
      },
    } as unknown as R2Bucket,
  };
  return { db, env, close: () => db.close() };
}
if (process.argv.includes("--serve")) {
  const directory =
    process.env.STUDIO_DATA_DIR ||
    path.resolve(
      fileURLToPath(new URL("../", import.meta.url)),
      "work/studio-local",
    );
  const origin = process.env.STUDIO_UI_ORIGIN || "http://127.0.0.1:4331",
    port = Number(process.env.STUDIO_API_PORT || 4332),
    local = createStandaloneStudio(directory, origin);
  const server = createServer(async (req, res) => {
    try {
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress || "",
        )
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const parts: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const part = Buffer.from(chunk);
        size += part.length;
        if (size > 26 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        parts.push(part);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      const request = new Request(new URL(req.url || "/", origin), {
        method: req.method,
        headers,
        ...(!["GET", "HEAD"].includes(req.method || "GET")
          ? { body: Buffer.concat(parts) }
          : {}),
      });
      const response = await handleStudio(request, local.env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "STUDIO_LOCAL_ERROR" }));
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Independent Studio API: http://127.0.0.1:${port} (Studio schema only; AI disabled)`,
    ),
  );
  const stop = () =>
    server.close(() => {
      local.close();
      process.exit(0);
    });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
