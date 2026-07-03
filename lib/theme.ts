"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/**
 * Sidebar'daki hızlı tema düğmesi için. Yalnızca <html> ve etkin durumu yönetir;
 * DB kalıcılığı üst katmanda (chat/page → PATCH /api/me) yapılır. `system`
 * tercihi de dahil, gerçek uygulanan tema `data-theme`'den okunur.
 */
export function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const setDark = useCallback((dark: boolean) => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    setIsDark(dark);
  }, []);

  return { isDark, setDark };
}
