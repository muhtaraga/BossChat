import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversationMembers, users } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";
import { areBlocked } from "@/lib/blocks";
import {
  findExistingDm,
  getConversationForUser,
  getConversationsForUser,
} from "@/lib/conversations";
import { convRoom, getIO, userRoom } from "@/lib/io";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  const list = await getConversationsForUser(userId);
  return NextResponse.json({ conversations: list });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type as "dm" | "group" | undefined;

  if (type === "dm") {
    const otherId = Number(body?.userId);
    if (!Number.isInteger(otherId) || otherId === userId) {
      return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
    }
    const [other] = await db.select().from(users).where(eq(users.id, otherId)).limit(1);
    if (!other) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });

    if (await areBlocked(userId, otherId)) {
      return NextResponse.json({ error: "Bu kullanıcıyla sohbet başlatılamaz." }, { status: 403 });
    }

    // Aynı kişiyle mevcut DM varsa onu döndür
    const existingId = await findExistingDm(userId, otherId);
    if (existingId) {
      const dto = await getConversationForUser(existingId, userId);
      return NextResponse.json({ conversation: dto, existing: true });
    }

    const [conv] = await db
      .insert(conversations)
      .values({ type: "dm", createdBy: userId })
      .returning();
    await db.insert(conversationMembers).values([
      { conversationId: conv.id, userId },
      { conversationId: conv.id, userId: otherId },
    ]);
    await notifyNewConversation(conv.id, [userId, otherId]);
    const dto = await getConversationForUser(conv.id, userId);
    return NextResponse.json({ conversation: dto }, { status: 201 });
  }

  if (type === "group") {
    const name = String(body?.name ?? "").trim().slice(0, 60);
    const memberIds: number[] = [
      ...new Set((body?.memberIds ?? []).map(Number).filter((n: number) => Number.isInteger(n))),
    ].filter((id) => id !== userId) as number[];

    if (!name) return NextResponse.json({ error: "Grup adı gerekli." }, { status: 400 });
    if (memberIds.length === 0) {
      return NextResponse.json({ error: "En az bir üye ekleyin." }, { status: 400 });
    }
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, memberIds));
    if (found.length !== memberIds.length) {
      return NextResponse.json({ error: "Bazı kullanıcılar bulunamadı." }, { status: 400 });
    }

    const [conv] = await db
      .insert(conversations)
      .values({ type: "group", name, createdBy: userId })
      .returning();
    await db.insert(conversationMembers).values([
      { conversationId: conv.id, userId, role: "admin" as const },
      ...memberIds.map((id) => ({ conversationId: conv.id, userId: id })),
    ]);
    await notifyNewConversation(conv.id, [userId, ...memberIds]);
    const dto = await getConversationForUser(conv.id, userId);
    return NextResponse.json({ conversation: dto }, { status: 201 });
  }

  return NextResponse.json({ error: "Geçersiz sohbet tipi." }, { status: 400 });
}

/** Üyelerin açık socket'lerini yeni odaya katar ve sohbeti bildirir. */
async function notifyNewConversation(conversationId: number, memberIds: number[]) {
  const io = getIO();
  if (!io) return;
  for (const memberId of memberIds) {
    io.in(userRoom(memberId)).socketsJoin(convRoom(conversationId));
    const dto = await getConversationForUser(conversationId, memberId);
    if (dto) io.to(userRoom(memberId)).emit("conversation:new", { conversation: dto });
  }
}
