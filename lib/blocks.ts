import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { blocks } from "@/db/schema";

/** Bu kullanıcının engellediği kullanıcı id'leri. */
export async function getBlockedIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: blocks.blockedId })
    .from(blocks)
    .where(eq(blocks.blockerId, userId));
  return rows.map((r) => r.id);
}

/**
 * userId ile ilişkili tüm engel id'leri (her iki yön): kullanıcının engellediği
 * VEYA kullanıcıyı engelleyenler. Arama/DM listelerini filtrelemek için kullanılır.
 */
export async function getRelatedBlockIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ blocker: blocks.blockerId, blocked: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  const ids = new Set<number>();
  for (const r of rows) {
    ids.add(r.blocker === userId ? r.blocked : r.blocker);
  }
  return [...ids];
}

/** a ve b arasında (her iki yönde) engel var mı? */
export async function areBlocked(a: number, b: number): Promise<boolean> {
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return !!row;
}
