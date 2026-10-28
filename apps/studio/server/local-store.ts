import { DatabaseSync } from "node:sqlite";
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
