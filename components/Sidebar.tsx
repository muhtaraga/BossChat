"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import { useTheme } from "@/lib/theme";
import {
  conversationAvatar,
  conversationTitle,
  displayName,
  formatTime,
} from "@/lib/format";
import type { ConversationDTO, UserDTO } from "@/types";

type ChipFilter = "all" | "unread" | "group";

function preview(conv: ConversationDTO, meId: number): string {
  const m = conv.lastMessage;
  if (!m) return conv.type === "group" ? "Grup oluşturuldu" : "Yeni sohbet";
  const prefix =
    m.senderId === meId ? "Sen: " : conv.type === "group" ? `${displayName(m.sender)}: ` : "";
  if (m.deletedAt !== null) return `${prefix}🚫 Silinen mesaj`;
  if (m.type === "image") return `${prefix}📷 Resim`;
  if (m.type === "file") return `${prefix}📄 ${m.fileName ?? "Dosya"}`;
  return prefix + (m.content ?? "");
}

export default function Sidebar({
  me,
  conversations,
  activeId,
  onlineIds,
  typingMap,
  connected,
  onSelect,
  onNewChat,
  onOpenSettings,
  onOpenGeneralSettings,
  onToggleTheme,
}: {
  me: UserDTO;
  conversations: ConversationDTO[];
  activeId: number | null;
  onlineIds: Set<number>;
  typingMap: Record<number, Record<number, string>>;
  connected: boolean;
  onSelect: (id: number) => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenGeneralSettings: () => void;
  onToggleTheme: (dark: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const [chip, setChip] = useState<ChipFilter>("all");
  const { isDark, setDark } = useTheme();

  const filtered = conversations.filter((c) => {
    if (chip === "unread" && c.unreadCount === 0) return false;
    if (chip === "group" && c.type !== "group") return false;
    return conversationTitle(c, me.id).toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <aside
      className="flex w-full flex-col overflow-hidden md:w-[372px] md:shrink-0"
      style={{
        background: "var(--panel)",
        borderRadius: "var(--radius, 26px)",
        boxShadow: "var(--shadow)",
      }}
    >
      {/* profil başlığı */}
      <div className="flex items-center gap-3 px-[18px] pt-[18px] pb-3.5">
        <button onClick={onOpenSettings} title="Profil ve ayarlar">
          <Avatar src={me.avatarUrl} name={displayName(me)} size={44} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-[16px] leading-tight font-bold">
            {displayName(me)}
          </p>
          <div
            className="mt-0.5 flex items-center gap-1.5 text-xs"
            style={{ color: "var(--muted)" }}
          >
            <span
              className="inline-block size-[7px] rounded-full"
              style={{ background: connected ? "#3aa06a" : "var(--muted)" }}
            />
            {connected ? "çevrimiçi" : "bağlanıyor..."}
          </div>
        </div>
        <button
          onClick={() => {
            const next = !isDark;
            setDark(next);
            onToggleTheme(next);
          }}
          title="Tema"
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--panel2)", color: "var(--text)" }}
        >
          {isDark ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
        </button>
        <button
          onClick={onOpenGeneralSettings}
          title="Ayarlar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--panel2)", color: "var(--text)" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          onClick={onNewChat}
          title="Yeni sohbet"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "var(--accent)", boxShadow: "0 3px 10px var(--accent-glow)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* arama */}
      <div className="px-[18px] pb-3">
        <div
          className="flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5"
          style={{ background: "var(--panel2)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Sohbetlerde ara"
            className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
            style={{ color: "var(--text)" }}
          />
        </div>
      </div>

      {/* filtre çipleri */}
      <div className="flex gap-2 px-[18px] pb-3">
        {(
          [
            ["all", "Tümü"],
            ["unread", "Okunmamış"],
            ["group", "Gruplar"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setChip(key)}
            className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium"
            style={
              chip === key
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--panel2)", color: "var(--muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* sohbet listesi */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3">
        {conversations.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: "var(--muted)" }}>
            <span className="text-4xl">💬</span>
            <p className="text-sm">Henüz sohbetin yok.</p>
            <button
              onClick={onNewChat}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
            >
              İlk sohbetini başlat
            </button>
          </div>
        )}
        {conversations.length > 0 && filtered.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: "var(--muted)" }}>
            Sonuç bulunamadı.
          </p>
        )}
        {filtered.map((conv) => {
          const other =
            conv.type === "dm" ? conv.members.find((m) => m.userId !== me.id) : undefined;
          const typing = Object.values(typingMap[conv.id] ?? {});
          const isActive = activeId === conv.id;
          const highlight = typing.length > 0 || conv.unreadCount > 0;
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className="mb-0.5 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
              style={{ background: isActive ? "var(--accent-soft)" : "transparent" }}
            >
              <Avatar
                src={conversationAvatar(conv, me.id)}
                name={conversationTitle(conv, me.id)}
                size={52}
                shape={conv.type === "group" ? "square" : "circle"}
                online={other ? onlineIds.has(other.userId) : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display truncate text-[15px] font-semibold">
                    {conversationTitle(conv, me.id)}
                  </span>
                  {conv.lastMessage && (
                    <span
                      className="shrink-0 text-[11.5px]"
                      style={{
                        color: highlight ? "var(--accent)" : "var(--muted)",
                        fontWeight: highlight ? 600 : 400,
                      }}
                    >
                      {formatTime(conv.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-[13.5px]"
                    style={{
                      color: typing.length > 0 ? "var(--accent)" : "var(--muted)",
                      fontWeight: highlight ? 600 : 400,
                      fontStyle: typing.length > 0 ? "italic" : "normal",
                    }}
                  >
                    {typing.length > 0 ? `${typing.join(", ")} yazıyor...` : preview(conv, me.id)}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span
                      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
