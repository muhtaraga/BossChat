import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversationMembers, pushSubscriptions, users } from "@/db/schema";
import { AUTH_COOKIE, getSessionUser } from "@/lib/auth";
import { parseSettings, toUserDTO } from "@/lib/dto";
import { mergeSettings } from "@/lib/settings";
import { convRoom, getIO, userRoom } from "@/lib/io";
import type { UserSettings } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  return NextResponse.json({ user: toUserDTO(user) });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const updates: Partial<{
    name: string;
    statusMessage: string;
    avatarUrl: string;
    settings: string;
  }> = {};

  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 50);
    if (!name) return NextResponse.json({ error: "İsim boş olamaz." }, { status: 400 });
    updates.name = name;
  }
  if (typeof body?.statusMessage === "string") {
    updates.statusMessage = body.statusMessage.trim().slice(0, 140);
  }
  if (typeof body?.avatarUrl === "string") {
    updates.avatarUrl = body.avatarUrl;
  }
  let mergedSettings: UserSettings | null = null;
  if (body?.settings != null && typeof body.settings === "object") {
    const merged = mergeSettings(parseSettings(user.settings), body.settings);
    mergedSettings = merged;
    updates.settings = JSON.stringify(merged);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Güncellenecek alan yok." }, { status: 400 });
  }

  const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();

  // Değişikliği bağlı istemcilere anlık yay (sayfa yenilemeye gerek kalmadan).
  const io = getIO();
  if (io) {
    const memberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, user.id));
    const dto = toUserDTO(updated);

    // a) Profil/ayar güncellemesi: sohbet odaları + kendi diğer sekmeleri
    for (const { conversationId } of memberships) {
      io.to(convRoom(conversationId)).emit("user:updated", { user: dto });
    }
    io.to(userRoom(user.id)).emit("user:updated", { user: dto });

    // Ayar değişikliklerinin gerektirdiği anlık yayınlar.
    if (mergedSettings) {
      const beforePrivacy = parseSettings(user.settings).privacy;

      // b) Okundu bilgisi KAPALI→AÇIK: geçmiş okumaları geriye dönük yay.
      // Ayar kapalıyken okunan mesajlar için lastReadMessageId ilerlemiş ama
      // yayın yapılmamış olur; açılınca karşı taraf güncel okundu konumunu alsın.
      if (!beforePrivacy.readReceipts && mergedSettings.privacy.readReceipts) {
        const rows = await db
          .select({
            conversationId: conversationMembers.conversationId,
            lastReadMessageId: conversationMembers.lastReadMessageId,
          })
          .from(conversationMembers)
          .where(eq(conversationMembers.userId, user.id));
        for (const r of rows) {
          if (r.lastReadMessageId > 0) {
            io.to(convRoom(r.conversationId)).emit("read", {
              conversationId: r.conversationId,
              userId: user.id,
              messageId: r.lastReadMessageId,
            });
          }
        }
      }

      // c) Son görülme/çevrimiçi görünürlüğü değiştiyse presence'i anlık yay ki
      // karşı taraf yeniden bağlanmadan online/offline durumunu görsün.
      if (beforePrivacy.lastSeen !== mergedSettings.privacy.lastSeen) {
        let online = false;
        for (const s of io.sockets.sockets.values()) {
          if ((s.data as { userId?: number }).userId === user.id) {
            online = true;
            break;
          }
        }
        // Açıldıysa ve kullanıcı çevrimiçiyse "çevrimiçi"; kapandıysa gizle (offline).
        const show = mergedSettings.privacy.lastSeen && online;
        for (const { conversationId } of memberships) {
          io.to(convRoom(conversationId)).emit("presence", {
            userId: user.id,
            online: show,
            lastSeenAt: null,
          });
        }
      }

      // d) Açık socket'lerdeki önbelleğe alınmış ayarları tazele; böylece
      // "yazıyor göstergesi" gibi socket.data'ya dayanan kontroller de
      // yeniden bağlanmaya gerek kalmadan etki eder.
      for (const s of io.sockets.sockets.values()) {
        if ((s.data as { userId?: number }).userId === user.id) {
          s.data.settings = mergedSettings;
        }
      }
    }
  }

  return NextResponse.json({ user: toUserDTO(updated) });
}

// Hesabı sil — grup geçmişini bozmamak için hard delete yerine anonimleştirme.
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  // İlişkili verileri temizle: push abonelikleri, sohbet üyelikleri, engel kayıtları.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  await db.delete(conversationMembers).where(eq(conversationMembers.userId, user.id));
  await db.delete(blocks).where(eq(blocks.blockerId, user.id));
  await db.delete(blocks).where(eq(blocks.blockedId, user.id));

  // Kullanıcı satırını anonimleştir (mesaj göndericisi "Silinmiş Hesap" görünür).
  const tombstone = `deleted:${user.id}:${Math.random().toString(36).slice(2, 10)}`;
  await db
    .update(users)
    .set({
      phone: tombstone,
      name: "Silinmiş Hesap",
      avatarUrl: null,
      statusMessage: null,
      settings: "{}",
      lastSeenAt: null,
    })
    .where(eq(users.id, user.id));

  // Oturumu kapat.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
