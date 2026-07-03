import "../server/env";
import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as sqliteSchema from "../db/schema.sqlite";
import * as pgSchema from "../db/schema.pg";

/**
 * SQLite'taki tüm veriyi PostgreSQL'e kopyalar.
 *
 * Kullanım:
 *   1. Postgres migration'larını uygula:
 *      DATABASE_URL=postgres://... npm run db:migrate  (schema.ts'yi pg'ye çevirdikten sonra)
 *   2. Bu scripti çalıştır:
 *      npx tsx scripts/copy-sqlite-to-postgres.ts postgres://user:pass@host:5432/bosschat
 *
 * SQLite kaynağı SQLITE_URL ile değiştirilebilir (varsayılan: file:./data/bosschat.db).
 */
async function main() {
  const pgUrl = process.argv[2] ?? process.env.DATABASE_URL;
  if (!pgUrl || !/^postgres(ql)?:/.test(pgUrl)) {
    console.error("Kullanım: npx tsx scripts/copy-sqlite-to-postgres.ts <postgres-url>");
    process.exit(1);
  }
  const sqliteUrl = process.env.SQLITE_URL ?? "file:./data/bosschat.db";

  const src = drizzleSqlite(createClient({ url: sqliteUrl }));
  const pool = new Pool({ connectionString: pgUrl });
  const dst = drizzlePg(pool);

  // FK sırasına göre: users -> conversations -> members -> messages -> push -> otp
  const tables = [
    ["users", sqliteSchema.users, pgSchema.users],
    ["conversations", sqliteSchema.conversations, pgSchema.conversations],
    ["conversation_members", sqliteSchema.conversationMembers, pgSchema.conversationMembers],
    ["messages", sqliteSchema.messages, pgSchema.messages],
    ["push_subscriptions", sqliteSchema.pushSubscriptions, pgSchema.pushSubscriptions],
    ["otp_codes", sqliteSchema.otpCodes, pgSchema.otpCodes],
  ] as const;

  for (const [name, srcTable, dstTable] of tables) {
    const rows = await src.select().from(srcTable as never);
    if (rows.length === 0) {
      console.log(`- ${name}: boş, atlandı`);
      continue;
    }
    // id'ler açıkça taşınır; sequence'lar sonra senkronlanır
    for (let i = 0; i < rows.length; i += 500) {
      await dst.insert(dstTable as never).values(rows.slice(i, i + 500) as never);
    }
    await dst.execute(
      sql.raw(
        `SELECT setval(pg_get_serial_sequence('${name}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${name}"))`,
      ),
    );
    console.log(`✓ ${name}: ${rows.length} satır kopyalandı`);
  }

  await pool.end();
  console.log("\n✅ Kopyalama tamamlandı. .env'de DATABASE_URL'i postgres yapmayı unutmayın.");
}

main().catch((err) => {
  console.error("Kopyalama hatası:", err);
  process.exit(1);
});
