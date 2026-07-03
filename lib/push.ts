import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

/**
 * Web Push (tarayıcı push bildirimi) yardımcıları.
 * VAPID anahtarları .env'de tanımlı değilse push sessizce devre dışı kalır.
 * Anahtar üretmek için: npx web-push generate-vapid-keys
 */
let configured = false;

function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@bosschat.local",
      publicKey,
      privateKey,
    );
    configured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  conversationId: number;
  tag?: string;
}

/** Kullanıcının tüm cihaz aboneliklerine bildirim yollar; ölü abonelikleri temizler. */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abonelik geçersiz olmuş (tarayıcı iptal etmiş) — sil
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error(`Push gönderilemedi (user ${userId}):`, err);
        }
      }
    }),
  );
}
