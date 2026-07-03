import "./env";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO, type TypedServer } from "../lib/io";
import { setupSocket } from "./socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => handle(req, res));

  const io: TypedServer = new Server(httpServer, {
    // Aynı origin'den bağlandığımız için CORS'a gerek yok; path varsayılan /socket.io
    maxHttpBufferSize: 1e6,
    // Kopan/kapanan bağlantıların daha hızlı tespiti (çevrimiçi/son görülme tutarlılığı)
    pingInterval: 15000,
    pingTimeout: 10000,
  });
  setIO(io);
  setupSocket(io);

  httpServer.listen(port, () => {
    console.log(`\n🚀 BossChat hazır: http://localhost:${port} (${dev ? "geliştirme" : "prod"})\n`);
  });
}

main().catch((err) => {
  console.error("Sunucu başlatılamadı:", err);
  process.exit(1);
});
