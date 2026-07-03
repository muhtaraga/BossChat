"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import MessageBubble from "@/components/MessageBubble";
import MessageInput from "@/components/MessageInput";
import MediaLightbox from "@/components/MediaLightbox";
import {
  conversationAvatar,
  conversationTitle,
  displayName,
  formatDay,
  formatLastSeen,
} from "@/lib/format";
import type { ConversationDTO, MessageDTO } from "@/types";

function HeaderIconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={disabled ? "Yakında" : title}
      onClick={onClick}
      disabled={disabled}
      className="flex size-[42px] items-center justify-center rounded-full disabled:cursor-default disabled:opacity-40"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}

export default function ChatWindow({
  conversation,
  meId,
  messages,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onSendText,
  onSendFile,
  onEditMessage,
  onDeleteMessage,
  onTyping,
  typingUsers,
  onlineIds,
  onBack,
  onOpenInfo,
  showReadReceipts = true,
  enterToSend = true,
}: {
  conversation: ConversationDTO;
  meId: number;
  messages: MessageDTO[];
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onSendText: (text: string) => void;
  onSendFile: (file: File, caption?: string) => Promise<void>;
  onEditMessage: (messageId: number, content: string) => void;
  onDeleteMessage: (messageId: number) => void;
  onTyping: (isTyping: boolean) => void;
  typingUsers: string[];
  onlineIds: Set<number>;
  onBack: () => void;
  onOpenInfo: () => void;
  showReadReceipts?: boolean;
  enterToSend?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const [editing, setEditing] = useState<MessageDTO | null>(null);
  const [media, setMedia] = useState<MessageDTO | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [unread, setUnread] = useState(0);

  const other = conversation.type === "dm"
    ? conversation.members.find((m) => m.userId !== meId)
    : undefined;
  const otherOnline = other ? onlineIds.has(other.userId) : false;

  // Karşı tarafların tamamının okuduğu son mesaj id'si (mavi tik eşiği)
  const others = conversation.members.filter((m) => m.userId !== meId);
  const minOtherRead =
    others.length > 0 ? Math.min(...others.map((m) => m.lastReadMessageId)) : 0;

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stickToBottomRef.current = true;
    setShowJump(false);
    setUnread(0);
  }

  // Yeni mesajda en alta kaydır; eski mesaj yüklemesinde konumu koru
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current;
      prevHeightRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (last && last.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = last.id;
      if (stickToBottomRef.current || last.senderId === meId) {
        scrollToBottom(false);
      } else if (last.senderId !== meId) {
        setUnread((n) => n + 1);
        setShowJump(true);
      }
    }
  }, [messages, meId]);

  // Sohbet değişince en alta in ve düzenleme modunu kapat
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJump(false);
    setUnread(0);
    lastMessageIdRef.current = null;
    setEditing(null);
    scrollToBottom(false);
  }, [conversation.id]);

  // İçerik boyutu değiştiğinde (görsel/font geç yüklenirse) en altta kal
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    stickToBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
    if (nearBottom) setUnread(0);
    if (loadingOlder || !hasMore) return;
    if (el.scrollTop < 60) {
      prevHeightRef.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  const isTyping = typingUsers.length > 0;

  const headerSubtitle = (() => {
    if (isTyping) {
      return conversation.type === "group"
        ? `${typingUsers.join(", ")} yazıyor...`
        : "yazıyor...";
    }
    if (conversation.type === "group") {
      const names = conversation.members.map((m) =>
        m.userId === meId ? "Sen" : displayName(m.user),
      );
      return names.join(", ");
    }
    if (otherOnline) return "çevrimiçi";
    return formatLastSeen(other?.user.lastSeenAt ?? null);
  })();

  // Tarih ayraçları için gruplama
  const rows: Array<{ kind: "day"; label: string; key: string } | { kind: "msg"; msg: MessageDTO }> =
    [];
  let lastDay = "";
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    if (day !== lastDay) {
      rows.push({ kind: "day", label: day, key: `day-${day}-${msg.id}` });
      lastDay = day;
    }
    rows.push({ kind: "msg", msg });
  }

  return (
    <section
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: "var(--panel)", borderRadius: "var(--radius, 26px)", boxShadow: "var(--shadow)" }}
    >
      {/* başlık */}
      <header
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={onBack}
          className="flex size-9 items-center justify-center rounded-full text-lg md:hidden"
          title="Geri"
        >
          ←
        </button>
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar
            src={conversationAvatar(conversation, meId)}
            name={conversationTitle(conversation, meId)}
            size={46}
            shape={conversation.type === "group" ? "square" : "circle"}
            online={conversation.type === "dm" ? otherOnline : undefined}
          />
          <span className="min-w-0">
            <span className="font-display block truncate text-[17px] font-bold">
              {conversationTitle(conversation, meId)}
            </span>
            <span
              className="block truncate text-[12.5px]"
              style={{
                color: isTyping ? "var(--accent)" : otherOnline ? "#3aa06a" : "var(--muted)",
                fontWeight: isTyping ? 600 : 400,
                fontStyle: isTyping ? "italic" : "normal",
              }}
            >
              {headerSubtitle}
            </span>
          </span>
        </button>
        <div className="hidden gap-1 sm:flex">
          <HeaderIconButton title="Ara" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="Sesli ara" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="Görüntülü ara" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m23 7-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
          </HeaderIconButton>
          <HeaderIconButton title="Sohbet bilgisi" onClick={onOpenInfo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="12" cy="5" r="0.6" />
              <circle cx="12" cy="12" r="0.6" />
              <circle cx="12" cy="19" r="0.6" />
            </svg>
          </HeaderIconButton>
        </div>
      </header>

      {/* mesajlar */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden px-6"
          style={{ paddingBlock: "var(--msg-py)", background: "var(--wallpaper)" }}
        >
          {loadingOlder && (
            <p className="py-2 text-center text-xs" style={{ color: "var(--muted)" }}>
              Yükleniyor...
            </p>
          )}
          {!hasMore && messages.length > 0 && (
            <p className="py-2 text-center text-xs" style={{ color: "var(--muted)" }}>
              Sohbetin başlangıcı
            </p>
          )}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center" style={{ color: "var(--muted)" }}>
              <span className="mb-2 text-4xl">👋</span>
              <p className="text-sm">Henüz mesaj yok. İlk mesajı sen gönder!</p>
            </div>
          )}
          <div
            ref={contentRef}
            className="mx-auto flex max-w-[820px] flex-col"
            style={{ gap: "var(--msg-gap)", zoom: "var(--font-scale)" }}
          >
            {rows.map((row) =>
              row.kind === "day" ? (
                <div key={row.key} className="flex justify-center py-2">
                  <span
                    className="rounded-full px-3.5 py-1 text-[12px] font-semibold"
                    style={{ background: "var(--panel2)", color: "var(--muted)" }}
                  >
                    {row.label}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={row.msg.id}
                  message={row.msg}
                  isOwn={row.msg.senderId === meId}
                  isGroup={conversation.type === "group"}
                  readByAll={showReadReceipts && row.msg.id > 0 && row.msg.id <= minOtherRead}
                  onEdit={setEditing}
                  onDelete={(id) => {
                    if (confirm("Bu mesaj herkes için silinsin mi?")) onDeleteMessage(id);
                  }}
                  onOpenMedia={setMedia}
                />
              ),
            )}
            {conversation.type === "dm" && isTyping && (
              <div className="mt-1 flex justify-start">
                <div
                  className="flex items-center gap-1.5 rounded-[20px] rounded-bl-md px-4 py-3"
                  style={{ background: "var(--bubble-other)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}
                >
                  <span className="size-[7px] rounded-full" style={{ background: "var(--muted)", animation: "bcDot 1.2s infinite" }} />
                  <span className="size-[7px] rounded-full" style={{ background: "var(--muted)", animation: "bcDot 1.2s infinite .2s" }} />
                  <span className="size-[7px] rounded-full" style={{ background: "var(--muted)", animation: "bcDot 1.2s infinite .4s" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {showJump && (
          <button
            onClick={() => scrollToBottom(true)}
            title="En alta in"
            className="absolute bottom-4 right-4 flex size-11 items-center justify-center rounded-full transition hover:opacity-90"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow)", color: "var(--muted)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
            {unread > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        )}
      </div>

      <MessageInput
        onSendText={(text) => {
          if (editing) {
            onEditMessage(editing.id, text);
            setEditing(null);
          } else {
            onSendText(text);
          }
        }}
        onSendFile={onSendFile}
        onTyping={onTyping}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        enterToSend={enterToSend}
      />

      {media && <MediaLightbox message={media} onClose={() => setMedia(null)} />}
    </section>
  );
}
