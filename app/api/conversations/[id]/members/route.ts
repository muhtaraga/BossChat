import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversationMembers, users } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";
import { getConversationForUser, getMembership } from "@/lib/conversations";
import { convRoom, getIO, userRoom } from "@/lib/io";

async function loadGroup(conversationId: number) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return conv && conv.type === "group" ? conv : null;
}

// Gruba üye ekle (sadece admin)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  const body = await req.json().catch(() => null);
  const targetId = Number(body?.userId);

  const conv = await loadGroup(conversationId);
  if (!conv) return NextResponse.json({ error: "Grup bulunamadı." }, { status: 404 });

  const me = await getMembership(conversationId, userId);
  if (!me) return NextResponse.json({ error: "Grup bulunamadı." }, { status: 404 });
  if (me.role !== "admin") {
    return NextResponse.json({ error: "Sadece adminler üye ekleyebilir." }, { status: 403 });
  }

  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
  if (await getMembership(conversationId, targetId)) {
    return NextResponse.json({ error: "Kullanıcı zaten üye." }, { status: 400 });
  }

  await db.insert(conversationMembers).values({ conversationId, userId: targetId });

  const io = getIO();
  if (io) {
    io.in(userRoom(targetId)).socketsJoin(convRoom(conversationId));
    const dto = await getConversationForUser(conversationId, targetId);
    if (dto) io.to(userRoom(targetId)).emit("conversation:new", { conversation: dto });
    io.to(convRoom(conversationId)).emit("conversation:updated", { conversationId });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// Üye çıkar: admin herkesi çıkarabilir, herkes kendini çıkarabilir (gruptan ayrıl)
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  const body = await req.json().catch(() => null);
  const targetId = Number(body?.userId ?? userId);

  const conv = await loadGroup(conversationId);
  if (!conv) return NextResponse.json({ error: "Grup bulunamadı." }, { status: 404 });

  const me = await getMembership(conversationId, userId);
  if (!me) return NextResponse.json({ error: "Grup bulunamadı." }, { status: 404 });

  const removingSelf = targetId === userId;
  if (!removingSelf && me.role !== "admin") {
    return NextResponse.json({ error: "Sadece adminler üye çıkarabilir." }, { status: 403 });
  }
  const target = await getMembership(conversationId, targetId);
  if (!target) return NextResponse.json({ error: "Kullanıcı üye değil." }, { status: 404 });

  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, targetId),
      ),
    );

  // Admin ayrıldıysa ve başka admin kalmadıysa en eski üyeyi admin yap
  if (target.role === "admin") {
    const remaining = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    if (remaining.length > 0 && !remaining.some((m) => m.role === "admin")) {
      const oldest = remaining.reduce((a, b) => (a.id < b.id ? a : b));
      await db
        .update(conversationMembers)
        .set({ role: "admin" })
        .where(eq(conversationMembers.id, oldest.id));
    }
  }

  const io = getIO();
  if (io) {
    io.to(userRoom(targetId)).emit("conversation:removed", { conversationId });
    io.in(userRoom(targetId)).socketsLeave(convRoom(conversationId));
    io.to(convRoom(conversationId)).emit("conversation:updated", { conversationId });
  }

  return NextResponse.json({ ok: true });
}
