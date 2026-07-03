"use client";

import type { FontScale, ThemePref, UserSettings } from "@/types";

// localStorage anahtarları — boyanmadan önce (layout init script) ve çalışma
// zamanında aynı değerler okunur/yazılır.
export const LS = {
  theme: "bosschat-theme",
  font: "bosschat-font",
  density: "bosschat-density",
  wallpaper: "bosschat-wallpaper",
} as const;

// Yazı boyutu → mesaj listesine uygulanan zoom çarpanı.
export const FONT_SCALE_MAP: Record<FontScale, string> = {
  sm: "0.92",
  md: "1",
  lg: "1.12",
};

/** Tercihi (light/dark/system) o anki etkin temaya (light/dark) çözer. */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  const dark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "light";
}

/**
 * Görünüm tercihlerini <html> üzerine uygular ve localStorage önbelleğini
 * günceller (böylece sonraki yüklemede init script anında boyar).
 */
export function applyAppearance(a: UserSettings["appearance"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(a.theme);
  root.dataset.density = a.density;
  root.dataset.wallpaper = a.wallpaper;
  root.style.setProperty("--font-scale", FONT_SCALE_MAP[a.fontScale] ?? "1");
  try {
    localStorage.setItem(LS.theme, a.theme);
    localStorage.setItem(LS.font, a.fontScale);
    localStorage.setItem(LS.density, a.density);
    localStorage.setItem(LS.wallpaper, a.wallpaper);
  } catch {
    /* yoksay */
  }
}
