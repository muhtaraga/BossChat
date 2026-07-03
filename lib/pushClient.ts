"use client";

// Tarayıcı Web Push aboneliği — hem ilk yüklemede (chat sayfası) hem de
// Ayarlar'daki bildirim anahtarında kullanılır.

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushState = "unsupported" | "denied" | "on" | "off";

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Bildirim izni ister ve bu cihazı aboneliğe kaydeder. Başarılıysa true. */
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const { key } = await (await fetch("/api/push/key")).json();
    if (!key) return false; // VAPID anahtarları tanımlı değil — push devre dışı
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      }));
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return true;
  } catch (err) {
    console.warn("Push aboneliği kurulamadı:", err);
    return false;
  }
}

/** Bu cihazın aboneliğini kaldırır (sunucudan ve tarayıcıdan). */
export async function unsubscribePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {
    /* yoksay */
  }
}
