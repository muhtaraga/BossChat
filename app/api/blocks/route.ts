import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blocks, users } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";
import { getBlockedIds } from "@/lib/blocks";
import { toUserDTO } from "@/lib/dto";

// Engellenen kişilerin listesi (UserDTO).
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const ids = await getBlockedIds(userId);
  if (ids.length === 0) return NextResponse.json({ users: [] });
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return NextResponse.json({ users: rows.map(toUserDTO) });
}

// Bir kullanıcıyı engelle (idempotent).
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetId = Number(body?.userId);
  if (!Number.isInteger(targetId) || targetId === userId) {
    return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });

  const [existing] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetId)))
    .limit(1);
  if (!existing) {
    await db.insert(blocks).values({ blockerId: userId, blockedId: targetId });
  }
  return NextResponse.json({ ok: true }, { status: existing ? 200 : 201 });
}

// Engeli kaldır.
export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetId = Number(body?.userId);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Geçersiz kullanıcı." }, { status: 400 });
  }
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetId)));
  return NextResponse.json({ ok: true });
}
