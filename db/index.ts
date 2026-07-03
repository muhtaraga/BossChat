import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// db'nin tipi, db/schema.ts'in aktif olarak export ettiği dialect'e göre türetilir.
// Böylece sütun tipleri (SQLiteColumn / PgColumn) tüm sorgularda doğru eşleşir.
type ActiveDb = typeof schema.dialect extends "postgresql"
  ? NodePgDatabase<typeof schema>
  : LibSQLDatabase<typeof schema>;

const url = process.env.DATABASE_URL ?? "file:./data/bosschat.db";
export const isPostgres = /^postgres(ql)?:/.test(url);

// Sürücü DATABASE_URL'den otomatik seçilir; şema ise db/schema.ts içindeki
// re-export ile belirlenir. İkisi uyuşmazsa erken ve açıklayıcı şekilde patla.
const schemaDialect: string = schema.dialect;
if (isPostgres && schemaDialect !== "postgresql") {
  throw new Error(
    "DATABASE_URL postgres ama db/schema.ts hâlâ SQLite şemasını export ediyor. " +
      'db/schema.ts içinde \'export * from "./schema.pg"\' satırını aktifleştirin.',
  );
}
if (!isPostgres && schemaDialect !== "sqlite") {
  throw new Error(
    "DATABASE_URL SQLite ama db/schema.ts Postgres şemasını export ediyor. " +
      'db/schema.ts içinde \'export * from "./schema.sqlite"\' satırını aktifleştirin.',
  );
}

function createDb(): ActiveDb {
  if (isPostgres) {
    const pool = new Pool({ connectionString: url });
    return drizzlePg(pool, { schema }) as unknown as ActiveDb;
  }

  fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  const client = createClient({ url });
  // Aynı süreçte iki modül grafiği (Next runtime + custom server) bağlanabildiği
  // için WAL + busy_timeout ile eşzamanlı yazmaları toleranslı hale getir.
  void client
    .executeMultiple(
      "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
    )
    .catch(() => {});
  return drizzleLibsql(client, { schema }) as unknown as ActiveDb;
}

export const db = createDb();
export { schema };
