import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types";

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

/**
 * Custom server (server/index.ts) io örneğini globalThis'e koyar; Next API
 * route'ları aynı süreçte çalıştığı için buradan erişip event yayınlayabilir.
 */
export function getIO(): TypedServer | null {
  return ((globalThis as Record<string, unknown>).__bosschat_io as TypedServer) ?? null;
}

export function setIO(io: TypedServer) {
  (globalThis as Record<string, unknown>).__bosschat_io = io;
}

export const convRoom = (conversationId: number) => `conv:${conversationId}`;
export const userRoom = (userId: number) => `user:${userId}`;
