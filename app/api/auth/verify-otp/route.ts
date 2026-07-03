import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { AUTH_COOKIE, sessionCookieOptions, signToken } from "@/lib/auth";
import { toUserDTO } from "@/lib/dto";
import { hashOtpCode, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ""));
  const code = String(body?.code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Telefon veya kod formatı hatalı." }, { status: 400 });
  }

  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(
      and(eq(otpCodes.phone, phone), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())),
    )
    .orderBy(desc(otpCodes.id))
    .limit(1);

  if (!otp) {
    return NextResponse.json(
      { error: "Kod bulunamadı veya süresi doldu. Yeni kod isteyin." },
      { status: 400 },
    );
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Çok fazla hatalı deneme. Yeni kod isteyin." },
      { status: 429 },
    );
  }

  if (otp.codeHash !== hashOtpCode(phone, code)) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, otp.id));
    return NextResponse.json({ error: "Kod hatalı." }, { status: 400 });
  }

  // Tüketimi consumedAt IS NULL şartıyla yap: eşzamanlı iki istek aynı kodu
  // doğru bilse bile yalnızca biri satırı güncelleyebilir (tek kullanımlık kod).
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  if (consumed.length === 0) {
    return NextResponse.json({ error: "Kod zaten kullanılmış." }, { status: 400 });
  }

  let [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const isNewUser = !user;
  if (!user) {
    [user] = await db.insert(users).values({ phone }).returning();
  }

  const token = await signToken(user.id);
  const res = NextResponse.json({ user: toUserDTO(user), isNewUser: isNewUser || !user.name });
  res.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
  return res;
}
