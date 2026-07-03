import { NextResponse } from "next/server";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { generateOtpCode, hashOtpCode, sendOtp, OTP_RATE_LIMIT, OTP_TTL_MS } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (!phone) {
    return NextResponse.json({ error: "Geçerli bir telefon numarası girin." }, { status: 400 });
  }

  // Brute-force / SMS bombardımanı koruması: pencere içinde kod sayısını sınırla
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        gt(otpCodes.createdAt, new Date(Date.now() - OTP_RATE_LIMIT.windowMs)),
      ),
    );
  if (Number(cnt) >= OTP_RATE_LIMIT.maxCodes) {
    return NextResponse.json(
      { error: "Çok fazla kod istendi. Lütfen birkaç dakika sonra tekrar deneyin." },
      { status: 429 },
    );
  }

  const code = generateOtpCode();
  await db.insert(otpCodes).values({
    phone,
    codeHash: hashOtpCode(phone, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  try {
    await sendOtp(phone, code);
  } catch (err) {
    console.error("OTP gönderilemedi:", err);
    return NextResponse.json({ error: "Kod gönderilemedi. Tekrar deneyin." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, phone });
}
