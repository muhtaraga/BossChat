import { defineConfig } from "drizzle-kit";

// SQLite yapılandırması. Postgres için: drizzle.pg.config.ts
// (npm run db:generate:pg)
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.sqlite.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL?.startsWith("file:")
      ? process.env.DATABASE_URL
      : "file:./data/bosschat.db",
  },
});
