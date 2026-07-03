"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessageDTO } from "@/types";
import { displayName, formatFileSize, formatTime, isVideoFile } from "@/lib/format";
import { senderColor } from "@/lib/avatarColor";

function Ticks({ read, pending }: { read: boolean; pending: boolean }) {
  if (pending) return <span className="text-[10px]" style={{ color: "var(--muted)" }}>🕓</span>;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" stroke={read ? "var(--accent)" : "var(--muted)"}>
      <path d="m1 13 4 4L15 7" />
      <path d="m9 17 1 1L23 5" />
    </svg>
  );
}

export default function MessageBubble({
  message,
  isOwn,
  isGroup,
  readByAll,
  onEdit,
  onDelete,
  onOpenMedia,
}: {
  message: MessageDTO;
  isOwn: boolean;
  isGroup: boolean;
  readByAll: boolean;
  onEdit: (message: MessageDTO) => void;
  onDelete: (messageId: number) => void;
  onOpenMedia: (message: MessageDTO) => void;
}) {
  const pending = message.id < 0; // optimistic mesajlar geçici negatif id taşır
  const deleted = message.deletedAt !== null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [message.content, expanded]);

  return (
    <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-3.5 py-2.5 md:max-w-[65%] ${
          isOwn ? "rounded-br-md" : "rounded-bl-md"
        }`}
        style={{
          background: isOwn ? "var(--accent-soft)" : "var(--bubble-other)",
          border: isOwn ? "none" : "1px solid var(--border)",
          boxShadow: "var(--shadow)",
        }}
      >
        {isGroup && !isOwn && !deleted && (
          <p className="mb-0.5 text-xs font-bold" style={{ color: senderColor(displayName(message.sender)) }}>
            {displayName(message.sender)}
          </p>
        )}

        {/* Kendi mesajları için düzenle/sil menüsü */}
        {isOwn && !deleted && !pending && (
          <div ref={menuRef} className="absolute -top-2 -left-2 z-10">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Mesaj seçenekleri"
              className="flex size-6 items-center justify-center rounded-full text-xs opacity-0 shadow transition group-hover:opacity-100"
              style={{ background: "var(--panel)", color: "var(--muted)" }}
            >
              ⌄
            </button>
            {menuOpen && (
              <div
                className="absolute top-7 left-0 w-32 overflow-hidden rounded-xl text-sm shadow-lg"
                style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
              >
                {message.type === "text" && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(message);
                    }}
                    className="block w-full px-3 py-2 text-left hover:opacity-80"
                  >
                    ✏️ Düzenle
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(message.id);
                  }}
                  className="block w-full px-3 py-2 text-left text-red-500 hover:opacity-80"
                >
                  🗑️ Sil
                </button>
              </div>
            )}
          </div>
        )}

        {deleted ? (
          <p className="text-sm italic" style={{ color: "var(--muted)" }}>
            🚫 Bu mesaj silindi
          </p>
        ) : (
          <>
            {message.type === "image" && message.fileUrl && (
              <button
                type="button"
                onClick={() => onOpenMedia(message)}
                className="block cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.fileUrl}
                  alt={message.fileName ?? "resim"}
                  className="mb-1 max-h-72 rounded-lg object-contain"
                />
              </button>
            )}

            {message.type === "file" && message.fileUrl && isVideoFile(message.fileName) && (
              <button
                type="button"
                onClick={() => onOpenMedia(message)}
                className="relative mb-1 block cursor-pointer overflow-hidden rounded-lg"
              >
                <video
                  src={message.fileUrl}
                  preload="metadata"
                  muted
                  className="max-h-72 rounded-lg"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span
                    className="flex size-14 items-center justify-center rounded-full text-white"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
              </button>
            )}

            {message.type === "file" && message.fileUrl && !isVideoFile(message.fileName) && (
              <a
                href={message.fileUrl}
                target="_blank"
                rel="noreferrer"
                download={message.fileName ?? undefined}
                className="mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:opacity-90"
                style={{ background: "var(--file-bg)" }}
              >
                <span
                  className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-white"
                  style={{ background: "var(--accent)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {message.fileName ?? "Dosya"}
                  </span>
                  <span className="text-[11.5px]" style={{ color: "var(--muted)" }}>
                    {formatFileSize(message.fileSize)}
                  </span>
                </span>
              </a>
            )}

            {message.content && (
              <>
                <p
                  ref={textRef}
                  className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap"
                  style={{
                    // leading-relaxed = 1.625 satır yüksekliği; 5 satır = 8.125em.
                    // -webkit-line-clamp, whitespace-pre-wrap ile çalışmadığından
                    // max-height ile kısıtlıyoruz (satır sınırında temiz kesim).
                    maxHeight: expanded ? undefined : "8.125em",
                    overflow: expanded ? undefined : "hidden",
                  }}
                >
                  {message.content}
                </p>
                {clamped && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-0.5 text-[12.5px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {expanded ? "Daha az göster" : "Devamını oku"}
                  </button>
                )}
              </>
            )}
          </>
        )}

        <div className="mt-0.5 flex items-center justify-end gap-1.5">
          {message.editedAt !== null && !deleted && (
            <span className="text-[10.5px] italic" style={{ color: "var(--muted)" }}>
              düzenlendi
            </span>
          )}
          <span className="text-[10.5px]" style={{ color: "var(--muted)" }}>
            {formatTime(message.createdAt)}
          </span>
          {isOwn && !deleted && <Ticks read={readByAll} pending={pending} />}
        </div>
      </div>
    </div>
  );
}
