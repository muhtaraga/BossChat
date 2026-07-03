import { DEFAULT_SETTINGS, type UserSettings } from "@/types";

// Enum alanların izin listeleri — istemciden gelen değerler bunlarla kısıtlanır.
const THEMES = ["light", "dark", "system"] as const;
const FONT_SCALES = ["sm", "md", "lg"] as const;
const DENSITIES = ["compact", "comfortable"] as const;

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Mevcut ayarları, istemciden gelen (kısmi ve güvenilmez) yama ile birleştirir.
 * Yalnızca bilinen anahtarlar ve doğru tip/enum değerleri kabul edilir; geri
 * kalan her şey mevcut değerlerde bırakılır. Sonuç DB'ye JSON olarak yazılabilir.
 */
export function mergeSettings(current: UserSettings, patch: unknown): UserSettings {
  const p = (patch ?? {}) as {
    notifications?: Record<string, unknown>;
    privacy?: Record<string, unknown>;
    appearance?: Record<string, unknown>;
  };
  const n = p.notifications ?? {};
  const pr = p.privacy ?? {};
  const a = p.appearance ?? {};
  return {
    notifications: {
      desktop: bool(n.desktop, current.notifications.desktop),
      sound: bool(n.sound, current.notifications.sound),
      preview: bool(n.preview, current.notifications.preview),
    },
    privacy: {
      readReceipts: bool(pr.readReceipts, current.privacy.readReceipts),
      lastSeen: bool(pr.lastSeen, current.privacy.lastSeen),
      typingIndicator: bool(pr.typingIndicator, current.privacy.typingIndicator),
    },
    appearance: {
      theme: oneOf(a.theme, THEMES, current.appearance.theme),
      fontScale: oneOf(a.fontScale, FONT_SCALES, current.appearance.fontScale),
      density: oneOf(a.density, DENSITIES, current.appearance.density),
      wallpaper:
        typeof a.wallpaper === "string"
          ? a.wallpaper.slice(0, 40)
          : current.appearance.wallpaper,
      enterToSend: bool(a.enterToSend, current.appearance.enterToSend),
    },
  };
}

export { DEFAULT_SETTINGS };
