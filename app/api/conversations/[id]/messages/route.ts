import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { getMembership, getMessagesPage } from "@/lib/conversations";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const { id } = await ctx.params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "Geçersiz sohbet." }, { status: 400 });
  }

  const membership = await getMembership(conversationId, userId);
  if (!membership) return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });

  const params = new URL(req.url).searchParams;
  const before = params.get("before") ? Number(params.get("before")) : undefined;
  const limit = params.get("limit") ? Number(params.get("limit")) : undefined;

  const page = await getMessagesPage(conversationId, { before, limit });
  return NextResponse.json(page);
}
