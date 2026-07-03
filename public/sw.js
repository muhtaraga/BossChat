/* BossChat service worker — Web Push bildirimleri */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload yoksa varsayılanlar kullanılır */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "BossChat", {
      body: data.body || "Yeni mesajın var.",
      tag: data.tag || (data.conversationId ? `conv-${data.conversationId}` : undefined),
      data: { conversationId: data.conversationId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if (win.url.includes("/chat") && "focus" in win) return win.focus();
      }
      return clients.openWindow("/chat");
    }),
  );
});
