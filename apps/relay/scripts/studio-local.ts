/** Loopback-only development adapter. Never imported by the production Worker. */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { handleStudio, type StudioEnv } from "../src/studio.js";

export class LocalD1Statement {
  args: unknown[] = [];
  constructor(
    readonly db: DatabaseSync,
    readonly query: string,
  ) {}
  bind(...args: unknown[]) {
    const statement = new LocalD1Statement(this.db, this.query);
    statement.args = args;
    return statement;
  }
  private parameters() {
    return this.args.map((value) => (value === undefined ? null : value)) as (
      | string
      | number
      | bigint
      | null
      | Uint8Array
    )[];
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.query).get(...this.parameters()) as
      | Record<string, unknown>
      | undefined;
    return (column ? row?.[column] : (row ?? null)) as T | null;
  }
  async all<T>() {
    return {
      success: true,
      results: this.db.prepare(this.query).all(...this.parameters()) as T[],
      meta: { changes: 0, duration: 0 },
    };
  }
  async run() {
    return this.execute();
  }
  execute() {
    const statement = this.db.prepare(this.query);
    if (statement.columns().length)
      return {
        success: true,
        results: statement.all(...this.parameters()),
        meta: { changes: 0, duration: 0 },
      };
    const result = statement.run(...this.parameters());
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        duration: 0,
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}
export function localD1(db: DatabaseSync): D1Database {
  return {
    prepare: (query: string) => new LocalD1Statement(db, query),
    batch: async (statements: LocalD1Statement[]) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}
export function createStudioLocal(
  directory: string,
  origin = "http://127.0.0.1:4331",
) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, "studio.sqlite"));
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS studio_local_migrations(name TEXT PRIMARY KEY)",
  );
  const migrations = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (
      db
        .prepare("SELECT name FROM studio_local_migrations WHERE name=?")
        .get(name)
    )
      continue;
    try {
      db.exec(readFileSync(path.join(migrations, name), "utf8"));
      db.prepare("INSERT INTO studio_local_migrations VALUES(?)").run(name);
    } catch (error) {
      throw Error(
        `Local migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const keyFile = path.join(directory, "vault.key");
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32).toString("base64"), { mode: 0o600 });
  const bucket = path.join(directory, "assets");
  mkdirSync(bucket, { recursive: true });
  const file = (key: string) => {
    if (!/^studio\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(key))
      throw Error("Invalid local asset key");
    return path.join(bucket, key.replaceAll("/", "_"));
  };
  const env = {
    DB: localD1(db),
    PUBLIC_ORIGIN: origin,
    APP_ORIGIN: origin,
    DASHBOARD_ORIGIN: origin,
    STUDIO_ORIGIN: origin,
    APP_TOKEN_KEY: readFileSync(keyFile, "utf8"),
    ARC_CHAT_ENABLED: "0",
    ARC_CREDITS_ENABLED: "0",
    ARC_BILLING_ENABLED: "0",
    STUDIO_MEDIA: {
      async put(key: string, data: ArrayBuffer | Uint8Array) {
        writeFileSync(file(key), new Uint8Array(data));
        return {};
      },
      async get(key: string) {
        const location = file(key);
        if (!existsSync(location)) return null;
        const data = readFileSync(location);
        return { body: new Uint8Array(data), size: data.byteLength };
      },
      async delete(keys: string | string[]) {
        for (const key of typeof keys === "string" ? [keys] : keys) {
          const location = file(key);
          if (existsSync(location)) unlinkSync(location);
        }
      },
    },
  } as unknown as StudioEnv;
  const seedUser = (id: string) => {
    const at = new Date().toISOString(),
      token = `studio-local-${id}`;
    db.prepare(
      "INSERT OR IGNORE INTO users(id,google_sub,email,name,created_at,role,plan) VALUES(?,?,?,?,?,'user','free')",
    ).run(id, "local-" + id, id + "@localhost", "Local Creator", at);
    db.prepare(
      "INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
    ).run(
      createHash("sha256").update(token).digest("hex"),
      id,
      new Date(Date.now() + 86400000).toISOString(),
      at,
    );
    return token;
  };
  return { db, env, seedUser, close: () => db.close() };
}

if (process.argv.includes("--serve")) {
  const directory =
    process.env.STUDIO_DATA_DIR ||
    path.resolve(
      fileURLToPath(new URL("../../../", import.meta.url)),
      "work/studio-local",
    );
  const origin = process.env.STUDIO_UI_ORIGIN || "http://127.0.0.1:4331",
    port = Number(process.env.STUDIO_API_PORT || 4332),
    local = createStudioLocal(directory, origin),
    token = local.seedUser("local-creator");
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
      let length = 0;
      for await (const chunk of req) {
        const data = Buffer.from(chunk);
        length += data.length;
        if (length > 26 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        parts.push(data);
      }
      const url = new URL(req.url || "/", origin),
        headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      }
      headers.set("cookie", "rl_session=" + token);
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(!["GET", "HEAD"].includes(req.method || "GET")
          ? { body: Buffer.concat(parts) }
          : {}),
      });
      const response =
        url.pathname === "/api/me"
          ? Response.json({
              authenticated: true,
              user: {
                id: "local-creator",
                email: "local-creator@localhost",
                name: "Local Creator",
                role: "user",
                plan: "free",
                isAdmin: false,
                arcAvailable: false,
              },
            })
          : url.pathname === "/api/status"
            ? Response.json({ devices: [] })
            : await handleStudio(request, local.env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "STUDIO_LOCAL_ERROR" }));
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Studio local API: http://127.0.0.1:${port} (loopback only; real SQLite and private local files; AI disabled)`,
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
