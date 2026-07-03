"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { applyAppearance } from "@/lib/appearance";
import { displayName } from "@/lib/format";
import {
  getPushState,
  subscribePush,
  unsubscribePush,
  type PushState,
} from "@/lib/pushClient";
import type { UserDTO, UserSettings } from "@/types";

type TabKey = "account" | "notifications" | "privacy" | "appearance";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "account", label: "Hesap & Profil", icon: "👤" },
  { key: "notifications", label: "Bildirimler", icon: "🔔" },
  { key: "privacy", label: "Gizlilik & Güvenlik", icon: "🔒" },
  { key: "appearance", label: "Görünüm & Sohbet", icon: "🎨" },
];

// ---- Küçük yeniden kullanılabilir kontroller ----

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
      style={{
        background: checked ? "var(--accent)" : "var(--panel2)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="absolute top-0.5 size-5 rounded-full bg-white transition-all"
        style={{ left: checked ? "1.35rem" : "0.15rem", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
      />
    </button>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            {desc}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full p-1" style={{ background: "var(--panel2)" }}>
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className="rounded-full px-3 py-1 text-[13px] font-medium transition"
          style={value === val ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function mergeSettings(s: UserSettings, partial: DeepPartial<UserSettings>): UserSettings {
  return {
    notifications: { ...s.notifications, ...(partial.notifications ?? {}) },
    privacy: { ...s.privacy, ...(partial.privacy ?? {}) },
    appearance: { ...s.appearance, ...(partial.appearance ?? {}) },
  };
}

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

const WALLPAPERS: [string, string][] = [
  ["default", "Noktalı"],
  ["plain", "Düz"],
  ["grid", "Izgara"],
  ["sunset", "Gün batımı"],
  ["mint", "Nane"],
];

export default function SettingsModal({
  me,
  initialTab = "account",
  onClose,
  onUpdated,
  onLogout,
  onDeleted,
}: {
  me: UserDTO;
  initialTab?: TabKey;
  onClose: () => void;
  onUpdated: (user: UserDTO) => void;
  onLogout: () => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [s, setS] = useState<UserSettings>(me.settings);
  // Ardışık hızlı değişikliklerde bayat closure'ı önlemek için en güncel ayarlar.
  const sRef = useRef<UserSettings>(me.settings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hesap & Profil
  const [name, setName] = useState(me.name ?? "");
  const [status, setStatus] = useState(me.statusMessage ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  // Bildirim (push)
  const [pushState, setPushState] = useState<PushState>("off");
  const [pushBusy, setPushBusy] = useState(false);

  // Gizlilik (engellenenler)
  const [blocked, setBlocked] = useState<UserDTO[]>([]);
  const [blockedLoaded, setBlockedLoaded] = useState(false);

  const patch = useCallback(
    async (body: unknown): Promise<UserDTO> => {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Güncellenemedi.");
      onUpdated(data.user);
      return data.user as UserDTO;
    },
    [onUpdated],
  );

  // Ayar değişikliği: optimistic + görünümü anında uygula + kalıcılaştır
  const updateSettings = useCallback(
    async (partial: DeepPartial<UserSettings>) => {
      const next = mergeSettings(sRef.current, partial);
      sRef.current = next;
      setS(next);
      setError(null);
      if (partial.appearance) applyAppearance(next.appearance);
      try {
        await patch({ settings: partial });
      } catch (err) {
        setError((err as Error).message);
        sRef.current = me.settings; // geri al
        setS(me.settings);
        if (partial.appearance) applyAppearance(me.settings.appearance);
      }
    },
    [patch, me.settings],
  );

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patch({ name, statusMessage: status });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Yükleme başarısız.");
      if (data.kind !== "image") throw new Error("Lütfen bir resim dosyası seçin.");
      await patch({ avatarUrl: data.url });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setError(null);
    try {
      if (pushState === "on") {
        await unsubscribePush();
      } else {
        const ok = await subscribePush();
        if (!ok) setError("Bildirim izni verilmedi veya push kullanılamıyor.");
      }
      setPushState(await getPushState());
    } finally {
      setPushBusy(false);
    }
  }

  async function unblock(userId: number) {
    setBusy(true);
    try {
      await fetch("/api/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setBlocked((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Hesap silinemedi.");
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // Push durumunu yükle
  useEffect(() => {
    void getPushState().then(setPushState);
  }, []);

  // Engellenenleri gizlilik sekmesine geçince yükle
  useEffect(() => {
    if (tab !== "privacy" || blockedLoaded) return;
    void (async () => {
      const res = await fetch("/api/blocks");
      if (res.ok) setBlocked((await res.json()).users ?? []);
      setBlockedLoaded(true);
    })();
  }, [tab, blockedLoaded]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] max-h-[640px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl md:flex-row"
        style={{ background: "var(--panel)", color: "var(--text)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sol menü */}
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto p-3 md:w-56 md:flex-col md:overflow-y-auto"
          style={{ background: "var(--panel2)" }}
        >
          <div className="hidden px-2 pt-1 pb-3 md:block">
            <h2 className="font-display text-lg font-bold">Ayarlar</h2>
          </div>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
              style={
                tab === t.key
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--muted)" }
              }
            >
              <span>{t.icon}</span>
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Sağ içerik */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <h3 className="font-display text-base font-bold">
              {TABS.find((t) => t.key === tab)?.label}
            </h3>
            <button onClick={onClose} className="text-xl hover:opacity-70" style={{ color: "var(--muted)" }}>
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            {/* ---- Hesap & Profil ---- */}
            {tab === "account" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    title="Avatar değiştir"
                    className="rounded-full transition hover:opacity-80"
                  >
                    <Avatar src={me.avatarUrl} name={displayName(me)} size={80} />
                  </button>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Avatarı değiştirmek için tıkla
                  </p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>{me.phone}</p>
                </div>

                <form onSubmit={saveProfile} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>İsim</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={50}
                      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                      style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>Durum mesajı</label>
                    <input
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      maxLength={140}
                      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                      style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="w-full rounded-lg py-2.5 font-semibold text-white transition disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                </form>

                <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={onLogout}
                    className="w-full rounded-lg py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
                  >
                    ⏻ Çıkış yap
                  </button>

                  {!deleteMode ? (
                    <button
                      onClick={() => setDeleteMode(true)}
                      className="w-full rounded-lg py-2.5 text-sm font-medium transition"
                      style={{ color: "var(--muted)" }}
                    >
                      Hesabı sil
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-xl p-3" style={{ background: "var(--panel2)", border: "1px solid var(--border)" }}>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        Bu işlem geri alınamaz. Onaylamak için <b>SİL</b> yazın.
                      </p>
                      <input
                        value={deleteText}
                        onChange={(e) => setDeleteText(e.target.value)}
                        placeholder="SİL"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setDeleteMode(false);
                            setDeleteText("");
                          }}
                          className="flex-1 rounded-lg py-2 text-sm font-medium"
                          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
                        >
                          Vazgeç
                        </button>
                        <button
                          onClick={deleteAccount}
                          disabled={busy || deleteText.trim() !== "SİL"}
                          className="flex-1 rounded-lg py-2 text-sm font-semibold text-white transition disabled:opacity-40"
                          style={{ background: "#dc2626" }}
                        >
                          Hesabı kalıcı olarak sil
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- Bildirimler ---- */}
            {tab === "notifications" && (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                <Row
                  title="Bu cihazda push bildirimleri"
                  desc={
                    pushState === "unsupported"
                      ? "Tarayıcınız desteklemiyor."
                      : pushState === "denied"
                        ? "Tarayıcı izni reddedilmiş. İzni ayarlardan açın."
                        : pushState === "on"
                          ? "Bu cihaz abone."
                          : "Kapalı — açmak için izin verin."
                  }
                >
                  <button
                    onClick={togglePush}
                    disabled={pushBusy || pushState === "unsupported" || pushState === "denied"}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-40"
                    style={{ background: pushState === "on" ? "var(--muted)" : "var(--accent)" }}
                  >
                    {pushBusy ? "..." : pushState === "on" ? "Kapat" : "Aç"}
                  </button>
                </Row>
                <Row title="Masaüstü / uygulama bildirimleri" desc="Sohbet açık değilken bildirim ve baloncuk göster.">
                  <Switch checked={s.notifications.desktop} onChange={(v) => updateSettings({ notifications: { desktop: v } })} />
                </Row>
                <Row title="Ses" desc="Yeni mesajda kısa bir ses çal.">
                  <Switch checked={s.notifications.sound} onChange={(v) => updateSettings({ notifications: { sound: v } })} />
                </Row>
                <Row title="Mesaj önizlemesi" desc="Bildirimde mesaj içeriğini göster.">
                  <Switch checked={s.notifications.preview} onChange={(v) => updateSettings({ notifications: { preview: v } })} />
                </Row>
              </div>
            )}

            {/* ---- Gizlilik & Güvenlik ---- */}
            {tab === "privacy" && (
              <div className="space-y-4">
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  <Row title="Okundu bilgisi" desc="Kapalıysa karşı taraf mesajları okuduğunuzu görmez (siz de göremezsiniz).">
                    <Switch checked={s.privacy.readReceipts} onChange={(v) => updateSettings({ privacy: { readReceipts: v } })} />
                  </Row>
                  <Row title="Son görülme & çevrimiçi" desc="Kapalıysa çevrimiçi/son görülme durumunuz paylaşılmaz.">
                    <Switch checked={s.privacy.lastSeen} onChange={(v) => updateSettings({ privacy: { lastSeen: v } })} />
                  </Row>
                  <Row title="Yazıyor göstergesi" desc="Kapalıysa yazarken karşı tarafa gösterilmez.">
                    <Switch checked={s.privacy.typingIndicator} onChange={(v) => updateSettings({ privacy: { typingIndicator: v } })} />
                  </Row>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--muted)" }}>
                    Engellenen kişiler
                  </p>
                  {!blockedLoaded ? (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>Yükleniyor...</p>
                  ) : blocked.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>Engellenen kişi yok.</p>
                  ) : (
                    <div className="space-y-1">
                      {blocked.map((u) => (
                        <div key={u.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                          <Avatar src={u.avatarUrl} name={displayName(u)} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{displayName(u)}</span>
                            <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>{u.phone}</span>
                          </span>
                          <button
                            disabled={busy}
                            onClick={() => unblock(u.id)}
                            className="rounded-lg px-3 py-1.5 text-sm font-medium"
                            style={{ background: "var(--panel2)", color: "var(--accent)" }}
                          >
                            Engeli kaldır
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- Görünüm & Sohbet ---- */}
            {tab === "appearance" && (
              <div className="space-y-1 divide-y" style={{ borderColor: "var(--border)" }}>
                <Row title="Tema">
                  <Segmented
                    value={s.appearance.theme}
                    options={[["light", "Açık"], ["dark", "Koyu"], ["system", "Sistem"]]}
                    onChange={(v) => updateSettings({ appearance: { theme: v } })}
                  />
                </Row>
                <Row title="Yazı boyutu">
                  <Segmented
                    value={s.appearance.fontScale}
                    options={[["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"]]}
                    onChange={(v) => updateSettings({ appearance: { fontScale: v } })}
                  />
                </Row>
                <Row title="Mesaj yoğunluğu">
                  <Segmented
                    value={s.appearance.density}
                    options={[["comfortable", "Ferah"], ["compact", "Sık"]]}
                    onChange={(v) => updateSettings({ appearance: { density: v } })}
                  />
                </Row>
                <Row title="Enter ile gönder" desc="Kapalıyken Enter satır atlar, Ctrl+Enter gönderir.">
                  <Switch checked={s.appearance.enterToSend} onChange={(v) => updateSettings({ appearance: { enterToSend: v } })} />
                </Row>
                <div className="py-3">
                  <p className="mb-2 text-sm font-medium">Sohbet duvar kağıdı</p>
                  <div className="flex flex-wrap gap-2">
                    {WALLPAPERS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => updateSettings({ appearance: { wallpaper: key } })}
                        className="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
                        style={
                          s.appearance.wallpaper === key
                            ? { background: "var(--accent)", color: "#fff" }
                            : { background: "var(--panel2)", color: "var(--muted)" }
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
