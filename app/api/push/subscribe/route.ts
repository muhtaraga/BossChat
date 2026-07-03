import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  const p256dh = String(body?.keys?.p256dh ?? "");
  const auth = String(body?.keys?.auth ?? "");
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "Geçersiz abonelik." }, { status: 400 });
  }

  // Aynı endpoint başka kullanıcıya kayıtlıysa devral (tarayıcı profili el değiştirmiş olabilir)
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  await db.insert(pushSubscriptions).values({ userId, endpoint, p256dh, auth });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) return NextResponse.json({ error: "endpoint gerekli." }, { status: 400 });

  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  return NextResponse.json({ ok: true });
}
