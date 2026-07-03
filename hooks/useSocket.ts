"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ withCredentials: true, autoConnect: true });
    // Sekme gerçekten kapanınca (bfcache değil) bağlantıyı hemen kapat ki
    // karşı taraf çevrimdışı/son görülme'yi hızlı görsün.
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", (e) => {
        if (!e.persisted) socket?.disconnect();
      });
    }
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/** Uygulama genelinde tek socket bağlantısını yöneten hook. */
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const s = getSocket();

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setConnected(false);

    // React state'ini gerçek socket durumuyla eşitle ve gerekirse kurtar.
    // Socket.IO'da middleware/soğuk başlangıç kaynaklı bir hata bağlantıyı
    // "terminal" (active=false, kendiliğinden yeniden bağlanmayan) duruma
    // sokabilir; ayrıca connect/connect_error olayı dinleyici bağlanmadan
    // önce gerçekleşmişse kaçırılabilir. Her iki durumda da "bağlanıyor"da
    // takılı kalmayı önlemek için durumu tazeleyip terminal durumdan çıkarız.
    const reconcile = () => {
      setConnected(s.connected);
      if (!s.connected && !s.active) s.connect();
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    // Dinleyiciler bağlanmadan önce gerçekleşmiş olabilecek durumu yakala.
    reconcile();
    // Emniyet ağı: kaçırılan olay / kurtarılamayan bağlantıya karşı periyodik
    // uzlaştırma. connected iken setConnected(true) yeniden render tetiklemez.
    const watchdog = setInterval(reconcile, 3000);

    return () => {
      clearInterval(watchdog);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
    };
  }, [s]);

  return { socket: s, connected };
}
