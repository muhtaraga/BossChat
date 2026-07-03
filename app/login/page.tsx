"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "code" | "profile";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Bir hata oluştu.");
    return data;
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await post("/api/auth/request-otp", { phone });
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await post("/api/auth/verify-otp", { phone, code });
      if (data.isNewUser) {
        setStep("profile");
      } else {
        router.push("/chat");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Profil kaydedilemedi.");
      router.push("/chat");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main
      className="flex min-h-dvh items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, var(--accent) 0%, #2c2723 100%)" }}
    >
      <div className="w-full max-w-sm rounded-2xl p-8 shadow-2xl" style={{ background: "var(--panel)", color: "var(--text)" }}>
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl text-3xl"
            style={{ background: "var(--accent)" }}
          >
            💬
          </div>
          <h1 className="font-display text-2xl font-bold">BossChat</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {step === "phone" && "Telefon numaranla giriş yap"}
            {step === "code" && `${phone} numarasına gönderilen kodu gir`}
            {step === "profile" && "Son bir adım: adını belirle"}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {step === "phone" && (
          <form onSubmit={requestOtp} className="space-y-4">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0555 123 45 67"
              autoFocus
              required
              className="w-full rounded-lg px-4 py-3 text-lg outline-none"
              style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Gönderiliyor..." : "Kod Gönder"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6 haneli kod"
              autoFocus
              required
              className="w-full rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none"
              style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg py-3 font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Doğrulanıyor..." : "Doğrula"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              className="w-full text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              Numarayı değiştir / yeni kod iste
            </button>
            <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
              Geliştirme modunda kod sunucu konsoluna yazılır.
            </p>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={saveProfile} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adın"
              autoFocus
              required
              maxLength={50}
              className="w-full rounded-lg px-4 py-3 text-lg outline-none"
              style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full rounded-lg py-3 font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Kaydediliyor..." : "Sohbete Başla"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
