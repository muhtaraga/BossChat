import "../server/env";

// DATABASE_URL'e göre doğru sürücü + migration klasörünü seçer.
async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/bosschat.db";

  if (/^postgres(ql)?:/.test(url)) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: "./db/migrations-pg" });
    await pool.end();
    console.log("✅ PostgreSQL migration'ları uygulandı.");
    return;
  }

  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: "./db/migrations" });
  console.log("✅ SQLite migration'ları uygulandı.");
}

main().catch((err) => {
  console.error("Migration hatası:", err);
  process.exit(1);
});
