import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  conversationMembers,
  messages,
  users,
  type Conversation,
} from "@/db/schema";
import { toMessageDTO, toUserDTO } from "@/lib/dto";
import type { ConversationDTO, MemberDTO, MessageDTO } from "@/types";

async function buildConversationDTOs(
  convs: Conversation[],
  forUserId: number,
): Promise<ConversationDTO[]> {
  if (convs.length === 0) return [];
  const convIds = convs.map((c) => c.id);

  const memberRows = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(inArray(conversationMembers.conversationId, convIds));

  const membersByConv = new Map<number, MemberDTO[]>();
  for (const { member, user } of memberRows) {
    const list = membersByConv.get(member.conversationId) ?? [];
    list.push({
      userId: member.userId,
      role: member.role,
      lastReadMessageId: member.lastReadMessageId,
      user: toUserDTO(user),
    });
    membersByConv.set(member.conversationId, list);
  }

  // Her sohbetin son mesajı
  const lastIds = await db
    .select({
      convId: messages.conversationId,
      maxId: sql<number>`max(${messages.id})`,
    })
    .from(messages)
    .where(inArray(messages.conversationId, convIds))
    .groupBy(messages.conversationId);

  const lastMessageByConv = new Map<number, MessageDTO>();
  if (lastIds.length > 0) {
    const lastRows = await db
      .select({ message: messages, sender: users })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(inArray(messages.id, lastIds.map((r) => r.maxId)));
    for (const { message, sender } of lastRows) {
      lastMessageByConv.set(message.conversationId, toMessageDTO(message, sender));
    }
  }

  // Okunmamış sayısı: benim lastReadMessageId'mden büyük, başkasının gönderdiği mesajlar
  const unreadRows = await db
    .select({
      convId: messages.conversationId,
      cnt: sql<number>`count(*)`,
    })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, forUserId),
      ),
    )
    .where(
      and(
        inArray(messages.conversationId, convIds),
        gt(messages.id, conversationMembers.lastReadMessageId),
        ne(messages.senderId, forUserId),
      ),
    )
    .groupBy(messages.conversationId);

  const unreadByConv = new Map(unreadRows.map((r) => [r.convId, Number(r.cnt)]));

  const dtos = convs.map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    avatarUrl: c.avatarUrl,
    createdBy: c.createdBy,
    createdAt: c.createdAt.getTime(),
    members: membersByConv.get(c.id) ?? [],
    lastMessage: lastMessageByConv.get(c.id) ?? null,
    unreadCount: unreadByConv.get(c.id) ?? 0,
  }));

  // Son aktiviteye göre sırala
  dtos.sort(
    (a, b) =>
      (b.lastMessage?.createdAt ?? b.createdAt) - (a.lastMessage?.createdAt ?? a.createdAt),
  );
  return dtos;
}

export async function getConversationsForUser(userId: number): Promise<ConversationDTO[]> {
  const convs = await db
    .select({ conversation: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, userId));
  return buildConversationDTOs(convs.map((r) => r.conversation), userId);
}

export async function getConversationForUser(
  conversationId: number,
  userId: number,
): Promise<ConversationDTO | null> {
  const membership = await getMembership(conversationId, userId);
  if (!membership) return null;
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;
  const [dto] = await buildConversationDTOs([conv], userId);
  return dto ?? null;
}

export async function getMembership(conversationId: number, userId: number) {
  const [row] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** İki kullanıcı arasında mevcut DM sohbeti varsa döndürür. */
export async function findExistingDm(userA: number, userB: number): Promise<number | null> {
  const rows = await db
    .select({ convId: conversationMembers.conversationId })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(eq(conversations.type, "dm"), inArray(conversationMembers.userId, [userA, userB])),
    )
    .groupBy(conversationMembers.conversationId)
    .having(sql`count(distinct ${conversationMembers.userId}) = 2`);
  return rows[0]?.convId ?? null;
}

export async function getMessagesPage(
  conversationId: number,
  opts: { before?: number; limit?: number },
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const conds = [eq(messages.conversationId, conversationId)];
  if (opts.before) conds.push(sql`${messages.id} < ${opts.before}` as never);

  const rows = await db
    .select({ message: messages, sender: users })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(...conds))
    .orderBy(desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page.map((r) => toMessageDTO(r.message, r.sender)), hasMore };
}
