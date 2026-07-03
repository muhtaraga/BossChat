// .env dosyasını diğer modüller değerlendirilmeden önce yükler.
// server/index.ts ve db/migrate.ts bu modülü ilk import olarak kullanır.
import { AsyncLocalStorage } from "node:async_hooks";

try {
  process.loadEnvFile(".env");
} catch {
  // .env yoksa sorun değil; varsayılanlar devreye girer.
}

// tsx ile custom server çalıştırırken Next'in beklediği global kurulumu yap
// (aksi halde "AsyncLocalStorage accessed in runtime where it is not available").
(globalThis as Record<string, unknown>).AsyncLocalStorage ??= AsyncLocalStorage;
