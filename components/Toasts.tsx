"use client";

export interface Toast {
  id: number;
  title: string;
  body: string;
  conversationId: number;
}

export default function Toasts({
  toasts,
  onOpen,
  onDismiss,
}: {
  toasts: Toast[];
  onOpen: (conversationId: number, toastId: number) => void;
  onDismiss: (toastId: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 rounded-xl p-3 shadow-lg"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <button
            onClick={() => onOpen(t.conversationId, t.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="font-display truncate text-sm font-bold">{t.title}</p>
            <p className="truncate text-sm" style={{ color: "var(--muted)" }}>{t.body}</p>
          </button>
          <button
            onClick={() => onDismiss(t.id)}
            className="hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
