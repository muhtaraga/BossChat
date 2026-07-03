import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getConversationForUser } from "@/lib/conversations";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Geçersiz sohbet." }, { status: 400 });
  }

  const dto = await getConversationForUser(conversationId, userId);
  if (!dto) return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });
  return NextResponse.json({ conversation: dto });
}
