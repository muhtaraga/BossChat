import type { Socket } from "socket.io";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers, conversations, messages, users } from "../db/schema";
import { AUTH_COOKIE, verifyToken } from "../lib/auth";
import { areBlocked } from "../lib/blocks";
import { getMembership } from "../lib/conversations";
import { parseSettings, toMessageDTO } from "../lib/dto";
import { convRoom, userRoom, type TypedServer } from "../lib/io";
import { sendPushToUser } from "../lib/push";
import type {
  ClientToServerEvents,
  MessageDTO,
  ServerToClientEvents,
  UserSettings,
} from "../types";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: { userId: number; name: string; settings: UserSettings };
};

/** Kullanıcının güncel gizlilik ayarını DB'den taze okur (anlık etki için). */
async function readPrivacy(userId: number): Promise<UserSettings["privacy"]> {
  const [row] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseSettings(row?.settings).privacy;
}

// userId -> aktif socketId kümesi (çoklu sekme desteği)
const userSockets = new Map<number, Set<string>>();
// Son bağlantı koptuktan sonra "çevrimdışı" yayınını geciktiren timer'lar.
// Kısa reconnect'lerde (sekme yenileme, HMR, ağ dalgalanması) titremeyi ve
// yarış koşulunu önler.
const pendingOffline = new Map<number, NodeJS.Timeout>();
const OFFLINE_GRACE_MS = 8000;

/**
 * Kullanıcı çevrimiçi sayılır mı: canlı socket'i varsa VEYA henüz grace
 * penceresi içindeyse (karşı taraf hâlâ "çevrimiçi" görüyor demektir).
 */
export function isOnline(userId: number): boolean {
  return (userSockets.get(userId)?.size ?? 0) > 0 || pendingOffline.has(userId);
}

/** Sohbetin çevrimdışı üyelerine tarayıcı push bildirimi yollar. */
async function pushToOfflineMembers(message: MessageDTO, senderName: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, message.conversationId))
    .limit(1);
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, message.conversationId));

  const body =
    message.type === "text"
      ? (message.content ?? "")
      : message.type === "image"
        ? "📷 Resim"
        : `📄 ${message.fileName ?? "Dosya"}`;
  const title =
    conv?.type === "group" && conv.name ? `${senderName} · ${conv.name}` : senderName;

  await Promise.all(
    members
      .filter((m) => m.userId !== message.senderId && !isOnline(m.userId))
      .map((m) =>
        sendPushToUser(m.userId, {
          title,
          body,
          conversationId: message.conversationId,
          tag: `conv-${message.conversationId}`,
        }),
      ),
  );
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function setupSocket(io: TypedServer) {
  io.use(async (socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
    const userId = token ? await verifyToken(token) : null;
    if (!userId) return next(new Error("unauthorized"));
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    socket.data.name = user.name ?? user.phone;
    socket.data.settings = parseSettings(user.settings);
    next();
  });

  io.on("connection", async (rawSocket) => {
    const socket = rawSocket as TypedSocket;
    const userId = socket.data.userId;

    // Kullanıcının tüm sohbet odalarına katıl
    const memberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));
    const convIds = memberships.map((m) => m.conversationId);

    socket.join(userRoom(userId));
    for (const id of convIds) socket.join(convRoom(id));

    // Çevrimiçi durumu — socketId kümesine ekle
    let set = userSockets.get(userId);
    // Bu bağlantıdan önce kullanıcı "çevrimiçi" olarak duyurulmuş muydu?
    // (Canlı socket'i vardı ya da grace penceresindeydi.)
    const wasAnnounced = (set?.size ?? 0) > 0 || pendingOffline.has(userId);
    if (!set) {
      set = new Set<string>();
      userSockets.set(userId, set);
    }
    set.add(socket.id);
    // Bekleyen çevrimdışı yayınını iptal et (kullanıcı geri döndü)
    const pending = pendingOffline.get(userId);
    if (pending) {
      clearTimeout(pending);
      pendingOffline.delete(userId);
    }
    // Yalnızca gerçekten yeni çevrimiçi olduysa yayınla (titremeyi önler).
    // Gizlilik: kullanıcı "son görülme/çevrimiçi"yi kapattıysa durumu sızdırma.
    if (!wasAnnounced && socket.data.settings.privacy.lastSeen) {
      for (const id of convIds) {
        socket.to(convRoom(id)).emit("presence", { userId, online: true, lastSeenAt: null });
      }
    }

    // Bağlanan kullanıcıya, sohbetlerindeki çevrimiçi kişileri bildir.
    // "Son görülme/çevrimiçi"yi kapatan kişiler çevrimiçi olarak sızdırılmaz.
    if (convIds.length > 0) {
      const contactRows = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(inArray(conversationMembers.conversationId, convIds));
      const candidates = [...new Set(contactRows.map((r) => r.userId))].filter(
        (id) => id !== userId && isOnline(id),
      );
      let onlineContacts = candidates;
      if (candidates.length > 0) {
        const settingRows = await db
          .select({ id: users.id, settings: users.settings })
          .from(users)
          .where(inArray(users.id, candidates));
        const hidden = new Set(
          settingRows.filter((r) => !parseSettings(r.settings).privacy.lastSeen).map((r) => r.id),
        );
        onlineContacts = candidates.filter((id) => !hidden.has(id));
      }
      socket.emit("presence:init", { onlineUserIds: onlineContacts });
    } else {
      socket.emit("presence:init", { onlineUserIds: [] });
    }

    socket.on("message:send", async (payload, ack) => {
      try {
        const membership = await getMembership(payload.conversationId, userId);
        if (!membership) {
          return ack({ ok: false, error: "Bu sohbetin üyesi değilsiniz.", tempId: payload.tempId });
        }

        // Engelleme: DM'de karşı tarafla aralarında engel varsa mesajı reddet.
        const [conv] = await db
          .select({ type: conversations.type })
          .from(conversations)
          .where(eq(conversations.id, payload.conversationId))
          .limit(1);
        if (conv?.type === "dm") {
          const [otherMember] = await db
            .select({ userId: conversationMembers.userId })
            .from(conversationMembers)
            .where(
              and(
                eq(conversationMembers.conversationId, payload.conversationId),
                ne(conversationMembers.userId, userId),
              ),
            )
            .limit(1);
          if (otherMember && (await areBlocked(userId, otherMember.userId))) {
            return ack({
              ok: false,
              error: "Bu kullanıcıyla mesajlaşamazsınız.",
              tempId: payload.tempId,
            });
          }
        }

        const content = payload.content?.trim() || null;
        if (payload.type === "text" && !content) {
          return ack({ ok: false, error: "Boş mesaj gönderilemez.", tempId: payload.tempId });
        }
        if ((payload.type === "image" || payload.type === "file") && !payload.fileUrl) {
          return ack({ ok: false, error: "Dosya eksik.", tempId: payload.tempId });
        }

        const [inserted] = await db
          .insert(messages)
          .values({
            conversationId: payload.conversationId,
            senderId: userId,
            type: payload.type,
            content,
            fileUrl: payload.fileUrl ?? null,
            fileName: payload.fileName ?? null,
            fileSize: payload.fileSize ?? null,
          })
          .returning();

        // Gönderen kendi mesajını okumuş sayılır
        await db
          .update(conversationMembers)
          .set({ lastReadMessageId: inserted.id })
          .where(eq(conversationMembers.id, membership.id));

        const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const dto = toMessageDTO(inserted, sender);

        socket.to(convRoom(payload.conversationId)).emit("message:new", { message: dto });
        ack({ ok: true, message: dto, tempId: payload.tempId });

        // Çevrimdışı üyelere tarayıcı push bildirimi (arka planda, hatası akışı bozmaz)
        void pushToOfflineMembers(dto, socket.data.name).catch((err) =>
          console.error("push hatası:", err),
        );
      } catch (err) {
        console.error("message:send hatası:", err);
        ack({ ok: false, error: "Mesaj gönderilemedi.", tempId: payload.tempId });
      }
    });

    socket.on("message:edit", async ({ messageId, content }, ack) => {
      try {
        const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
        if (!msg || msg.senderId !== userId || msg.deletedAt) {
          return ack({ ok: false, error: "Mesaj düzenlenemez." });
        }
        if (msg.type !== "text") {
          return ack({ ok: false, error: "Sadece metin mesajları düzenlenebilir." });
        }
        const trimmed = content?.trim();
        if (!trimmed) return ack({ ok: false, error: "Mesaj boş olamaz." });
        if (trimmed === msg.content) {
          const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          return ack({ ok: true, message: toMessageDTO(msg, sender) });
        }

        const [updated] = await db
          .update(messages)
          .set({ content: trimmed, editedAt: new Date() })
          .where(eq(messages.id, messageId))
          .returning();
        const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const dto = toMessageDTO(updated, sender);
        io.to(convRoom(msg.conversationId)).emit("message:updated", { message: dto });
        ack({ ok: true, message: dto });
      } catch (err) {
        console.error("message:edit hatası:", err);
        ack({ ok: false, error: "Mesaj düzenlenemedi." });
      }
    });

    socket.on("message:delete", async ({ messageId }, ack) => {
      try {
        const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
        if (!msg || msg.senderId !== userId) {
          return ack({ ok: false, error: "Mesaj silinemez." });
        }
        if (msg.deletedAt) {
          const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          return ack({ ok: true, message: toMessageDTO(msg, sender) });
        }

        const [updated] = await db
          .update(messages)
          .set({ deletedAt: new Date() })
          .where(eq(messages.id, messageId))
          .returning();
        const [sender] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        const dto = toMessageDTO(updated, sender);
        io.to(convRoom(msg.conversationId)).emit("message:updated", { message: dto });
        ack({ ok: true, message: dto });
      } catch (err) {
        console.error("message:delete hatası:", err);
        ack({ ok: false, error: "Mesaj silinemedi." });
      }
    });

    socket.on("typing", async ({ conversationId, isTyping }) => {
      if (!socket.rooms.has(convRoom(conversationId))) return;
      // Gizlilik: "yazıyor" göstergesi kapalıysa yayınlama (istemci de göndermez).
      if (!socket.data.settings.privacy.typingIndicator) return;
      socket.to(convRoom(conversationId)).emit("typing", {
        conversationId,
        userId,
        name: socket.data.name,
        isTyping,
      });
    });

    socket.on("read", async ({ conversationId, messageId }) => {
      try {
        const membership = await getMembership(conversationId, userId);
        if (!membership || messageId <= membership.lastReadMessageId) return;
        // Okunmamış sayısı doğru kalsın diye lastRead her zaman güncellenir.
        await db
          .update(conversationMembers)
          .set({ lastReadMessageId: messageId })
          .where(
            and(
              eq(conversationMembers.conversationId, conversationId),
              eq(conversationMembers.userId, userId),
            ),
          );
        // Gizlilik: okundu bilgisi kapalıysa diğer üyelere yayınlama (iki yönlü;
        // istemci de kendi tarafında başkalarının okundu bilgisini gizler).
        const { readReceipts } = await readPrivacy(userId);
        if (readReceipts) {
          io.to(convRoom(conversationId)).emit("read", { conversationId, userId, messageId });
        }
      } catch (err) {
        console.error("read hatası:", err);
      }
    });

    socket.on("disconnect", () => {
      const set = userSockets.get(userId);
      if (!set) return;
      set.delete(socket.id);
      if (set.size > 0) return; // başka açık sekme/bağlantı var
      userSockets.delete(userId);

      // Hemen çevrimdışı yapma; kısa reconnect'lere karşı grace penceresi tanı.
      // Bu, disconnect→connect yarışında kullanıcının yanlışlıkla çevrimdışı
      // takılmasını da engeller.
      const timer = setTimeout(async () => {
        pendingOffline.delete(userId);
        // Grace boyunca geri döndüyse çevrimdışı yayınlama
        if ((userSockets.get(userId)?.size ?? 0) > 0) return;

        const lastSeenAt = new Date();
        try {
          await db.update(users).set({ lastSeenAt }).where(eq(users.id, userId));
        } catch (err) {
          console.error("lastSeen güncellenemedi:", err);
        }
        // Gizlilik: "son görülme/çevrimiçi" kapalıysa çevrimdışı geçişini/son
        // görülmeyi yayınlama. (Taze oku — oturum içinde değişmiş olabilir.)
        const { lastSeen } = await readPrivacy(userId);
        if (!lastSeen) return;
        // Bağlantı sonrası katılınan yeni sohbetler de dahil olsun diye tekrar sorgula
        const current = await db
          .select({ conversationId: conversationMembers.conversationId })
          .from(conversationMembers)
          .where(eq(conversationMembers.userId, userId));
        for (const { conversationId } of current) {
          io.to(convRoom(conversationId)).emit("presence", {
            userId,
            online: false,
            lastSeenAt: lastSeenAt.getTime(),
          });
        }
      }, OFFLINE_GRACE_MS);
      pendingOffline.set(userId, timer);
    });
  });
}
