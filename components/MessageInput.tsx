"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageDTO } from "@/types";
import { formatFileSize } from "@/lib/format";

type FileKind = "image" | "video" | "doc";

const ACCEPT: Record<FileKind, string> = {
  image: "image/png,image/jpeg,image/gif,image/webp,image/avif",
  video: "video/mp4,video/webm,video/quicktime,video/ogg",
  doc: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.rar,.csv",
};

export default function MessageInput({
  onSendText,
  onSendFile,
  onTyping,
  editing,
  onCancelEdit,
  disabled,
  enterToSend = true,
}: {
  onSendText: (text: string) => void;
  onSendFile: (file: File, caption?: string) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  editing: MessageDTO | null;
  onCancelEdit: () => void;
  disabled?: boolean;
  enterToSend?: boolean;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Düzenleme moduna girince mevcut içeriği input'a taşı
  useEffect(() => {
    if (editing) {
      setText(editing.content ?? "");
      textareaRef.current?.focus();
    } else {
      setText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Dosya tipi menüsünü dışa tıklayınca kapat
  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // Önizleme objesi URL'ini temizle
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleChange(value: string) {
    setText(value);
    if (!isTypingRef.current && value.trim()) {
      isTypingRef.current = true;
      onTyping(true);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 2000);
  }

  function pickType(kind: FileKind) {
    setMenuOpen(false);
    const input = fileRef.current;
    if (!input) return;
    input.accept = ACCEPT[kind];
    input.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(
      file.type.startsWith("image/") || file.type.startsWith("video/")
        ? URL.createObjectURL(file)
        : null,
    );
  }

  function clearPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  }

  function stopTyping() {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
  }

  async function submit() {
    const trimmed = text.trim();
    // Dosya + (opsiyonel) açıklama tek mesajda gönderilir
    if (pendingFile && !editing) {
      const file = pendingFile;
      const caption = trimmed || undefined;
      clearPending();
      setText("");
      stopTyping();
      setUploading(true);
      try {
        await onSendFile(file, caption);
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    stopTyping();
  }

  const isVideoPreview = pendingFile?.type.startsWith("video/") ?? false;
  const isImagePreview = pendingFile?.type.startsWith("image/") ?? false;
  const canSend = !disabled && (!!pendingFile || !!text.trim());

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      {editing && (
        <div
          className="flex items-center justify-between px-5 py-2 text-sm"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--accent-soft)" }}
        >
          <span className="min-w-0 truncate" style={{ color: "var(--muted)" }}>
            ✏️ Mesajı düzenliyorsun: <span className="italic">{editing.content}</span>
          </span>
          <button
            onClick={onCancelEdit}
            title="Düzenlemeyi iptal et"
            className="ml-3 shrink-0"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
      )}

      {pendingFile && !editing && (
        <div
          className="flex items-center gap-3 px-5 py-2.5"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--accent-soft)" }}
        >
          {isImagePreview && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={pendingFile.name}
              className="size-14 shrink-0 rounded-lg object-cover"
            />
          ) : isVideoPreview && previewUrl ? (
            <video src={previewUrl} muted className="size-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span
              className="flex size-14 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ background: "var(--accent)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
              {pendingFile.name}
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--muted)" }}>
              {formatFileSize(pendingFile.size)}
            </span>
          </span>
          <button
            onClick={clearPending}
            title="Kaldır"
            className="shrink-0 text-lg hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2.5 px-5 py-3.5">
        <input ref={fileRef} type="file" hidden onChange={handleFile} />
        <div ref={menuRef} className="relative shrink-0">
          {menuOpen && (
            <div
              className="absolute bottom-13 left-0 w-40 overflow-hidden rounded-xl text-sm shadow-lg"
              style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
            >
              <button
                type="button"
                onClick={() => pickType("image")}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:opacity-80"
              >
                <span>🖼️</span> Görsel
              </button>
              <button
                type="button"
                onClick={() => pickType("video")}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:opacity-80"
              >
                <span>🎬</span> Video
              </button>
              <button
                type="button"
                onClick={() => pickType("doc")}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:opacity-80"
              >
                <span>📄</span> Belge
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={disabled || uploading || !!editing}
            title="Dosya ekle"
            className="flex size-11 items-center justify-center rounded-full disabled:opacity-50"
            style={{ background: "var(--panel2)", color: "var(--muted)" }}
          >
            {uploading ? (
              "⏳"
            ) : (
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.19 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.59-2.59l8.49-8.48" />
              </svg>
            )}
          </button>
        </div>
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[22px] py-1.5 pr-2 pl-4"
          style={{ background: "var(--panel2)" }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // enterToSend: Enter=gönder, Shift+Enter=satır.
                // Kapalı: Enter=satır, Ctrl/Cmd+Enter=gönder.
                const send = enterToSend
                  ? !e.shiftKey && !e.ctrlKey && !e.metaKey
                  : e.ctrlKey || e.metaKey;
                if (send) {
                  e.preventDefault();
                  void submit();
                }
              }
              if (e.key === "Escape" && editing) onCancelEdit();
            }}
            placeholder={
              editing ? "Mesajı düzenle..." : pendingFile ? "Açıklama ekle..." : "Bir mesaj yazın"
            }
            rows={1}
            disabled={disabled}
            className="min-h-9 max-h-32 min-w-0 flex-1 resize-none border-none bg-transparent py-1.5 text-[14.5px] leading-snug outline-none"
            style={{ color: "var(--text)" }}
          />
          <button
            type="button"
            title="Emoji"
            disabled
            className="flex size-[34px] shrink-0 cursor-default items-center justify-center rounded-full opacity-40"
            style={{ color: "var(--muted)" }}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14.5a4 4 0 0 0 7 0" />
              <path d="M9 9h.01M15 9h.01" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={editing ? !text.trim() : !canSend}
          title={editing ? "Kaydet" : "Gönder"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ background: "var(--accent)", boxShadow: "0 3px 12px var(--accent-glow)" }}
        >
          {editing ? (
            "✓"
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22l-4-9-9-4z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
