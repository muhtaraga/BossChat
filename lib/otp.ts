import { createHash, randomInt } from "node:crypto";

/**
 * OTP gönderim sağlayıcısı soyutlaması.
 * Geliştirmede kod konsola yazılır; prod'da OTP_PROVIDER=twilio ile
 * Twilio'ya (veya başka bir SMS servisine) yönlendirilebilir.
 */
export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

const consoleProvider: OtpProvider = {
  async send(phone, code) {
    console.log(`\n📱 [OTP] ${phone} numarasına doğrulama kodu: ${code}\n`);
  },
};

const twilioProvider: OtpProvider = {
  async send(phone, code) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error("Twilio ortam değişkenleri eksik (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)");
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        From: from,
        Body: `BossChat doğrulama kodunuz: ${code}`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Twilio SMS gönderilemedi: ${res.status} ${await res.text()}`);
    }
  },
};

function getProvider(): OtpProvider {
  return process.env.OTP_PROVIDER === "twilio" ? twilioProvider : consoleProvider;
}

export async function sendOtp(phone: string, code: string): Promise<void> {
  await getProvider().send(phone, code);
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// Kod veritabanında düz metin yerine hash'lenmiş saklanır.
export function hashOtpCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 dakika
export const OTP_MAX_ATTEMPTS = 5; // kod başına deneme limiti
export const OTP_RATE_LIMIT = { windowMs: 10 * 60 * 1000, maxCodes: 5 }; // 10 dk'da en fazla 5 kod
