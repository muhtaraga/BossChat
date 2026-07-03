import { NextResponse } from "next/server";
import { and, like, ne, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";
import { getRelatedBlockIds } from "@/lib/blocks";
import { toUserDTO } from "@/lib/dto";
import { normalizePhone } from "@/lib/phone";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  // Engellenen / engelleyen kullanıcıları aramadan gizle.
  const blockedIds = await getRelatedBlockIds(userId);

  const digits = q.replace(/[^\d]/g, "");
  const asPhone = normalizePhone(q);
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        ...(blockedIds.length > 0 ? [notInArray(users.id, blockedIds)] : []),
        or(
          like(users.name, `%${q}%`),
          ...(digits.length >= 4 ? [like(users.phone, `%${digits}%`)] : []),
          ...(asPhone ? [like(users.phone, `%${asPhone}%`)] : []),
        ),
      ),
    )
    .limit(20);

  return NextResponse.json({ users: rows.map(toUserDTO) });
}
