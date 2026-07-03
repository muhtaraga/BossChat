"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { conversationTitle, displayName, formatLastSeen } from "@/lib/format";
import type { ConversationDTO, UserDTO } from "@/types";

export default function GroupInfoModal({
  conversation,
  meId,
  onlineIds,
  onClose,
  onLeft,
}: {
  conversation: ConversationDTO;
  meId: number;
  onlineIds: Set<number>;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const me = conversation.members.find((m) => m.userId === meId);
  const isAdmin = me?.role === "admin";
  const isGroup = conversation.type === "group";
  const memberIds = new Set(conversation.members.map((m) => m.userId));
  const otherId = isGroup ? null : conversation.members.find((m) => m.userId !== meId)?.userId ?? null;

  // DM'de karşı tarafın engelli olup olmadığını yükle
  useEffect(() => {
    if (isGroup || otherId == null) return;
    void (async () => {
      const res = await fetch("/api/blocks");
      if (res.ok) {
        const users: UserDTO[] = (await res.json()).users ?? [];
        setBlocked(users.some((u) => u.id === otherId));
      }
    })();
  }, [isGroup, otherId]);

  async function toggleBlock() {
    if (otherId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/blocks", {
        method: blocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: otherId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "İşlem başarısız.");
      setBlocked((v) => !v);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isAdmin || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults((data.users ?? []).filter((u: UserDTO) => !memberIds.has(u.id)));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isAdmin, conversation.members.length]);

  async function memberAction(method: "POST" | "DELETE", userId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/members`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "İşlem başarısız.");
      if (method === "DELETE" && userId === meId) onLeft();
      if (method === "POST") setQuery("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl shadow-2xl"
        style={{ background: "var(--panel)", color: "var(--text)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-display text-lg font-bold">
            {isGroup ? "Grup Bilgisi" : "Kişi Bilgisi"}
          </h2>
          <button onClick={onClose} className="text-xl hover:opacity-70" style={{ color: "var(--muted)" }}>
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              src={isGroup ? conversation.avatarUrl : conversation.members.find((m) => m.userId !== meId)?.user.avatarUrl}
              name={conversationTitle(conversation, meId)}
              size={72}
              shape={isGroup ? "square" : "circle"}
            />
            <p className="font-display text-lg font-bold">{conversationTitle(conversation, meId)}</p>
            {isGroup && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>{conversation.members.length} üye</p>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {!isGroup &&
            (() => {
              const other = conversation.members.find((m) => m.userId !== meId);
              if (!other) return null;
              return (
                <>
                  <div className="space-y-2 rounded-xl p-4 text-sm" style={{ background: "var(--panel2)" }}>
                    <p>
                      <span style={{ color: "var(--muted)" }}>Telefon: </span>
                      {other.user.phone}
                    </p>
                    {other.user.statusMessage && (
                      <p>
                        <span style={{ color: "var(--muted)" }}>Durum: </span>
                        {other.user.statusMessage}
                      </p>
                    )}
                    <p>
                      <span style={{ color: "var(--muted)" }}>Durum: </span>
                      {onlineIds.has(other.userId)
                        ? "çevrimiçi"
                        : formatLastSeen(other.user.lastSeenAt)}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={toggleBlock}
                    className="w-full rounded-lg border py-2.5 text-sm font-medium transition disabled:opacity-50"
                    style={
                      blocked
                        ? { borderColor: "var(--border)", color: "var(--accent)" }
                        : { borderColor: "rgb(254 202 202)", color: "#ef4444" }
                    }
                  >
                    {blocked ? "Engeli kaldır" : "Kullanıcıyı engelle"}
                  </button>
                </>
              );
            })()}

          {isGroup && (
            <>
              {isAdmin && (
                <div className="space-y-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Üye eklemek için ara..."
                    className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                    style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
                  />
                  {results.map((user) => (
                    <button
                      key={user.id}
                      disabled={busy}
                      onClick={() => memberAction("POST", user.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:opacity-80"
                    >
                      <Avatar src={user.avatarUrl} name={displayName(user)} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {displayName(user)}
                        </span>
                        <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>
                          {user.phone}
                        </span>
                      </span>
                      <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>Ekle</span>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--muted)" }}>
                  Üyeler
                </p>
                <div className="space-y-1">
                  {conversation.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                    >
                      <Avatar
                        src={member.user.avatarUrl}
                        name={displayName(member.user)}
                        size={36}
                        online={onlineIds.has(member.userId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {member.userId === meId ? "Sen" : displayName(member.user)}
                        </span>
                        <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>
                          {member.user.phone}
                        </span>
                      </span>
                      {member.role === "admin" && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                        >
                          Admin
                        </span>
                      )}
                      {isAdmin && member.userId !== meId && (
                        <button
                          disabled={busy}
                          onClick={() => memberAction("DELETE", member.userId)}
                          title="Üyeyi çıkar"
                          className="text-sm text-red-400 hover:text-red-600"
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                disabled={busy}
                onClick={() => memberAction("DELETE", meId)}
                className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
              >
                Gruptan Ayrıl
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
