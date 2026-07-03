"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { displayName } from "@/lib/format";
import type { UserDTO } from "@/types";

function useUserSearch(query: string) {
  const [results, setResults] = useState<UserDTO[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.users ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return { results, searching };
}

export default function NewChatModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<UserDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { results, searching } = useUserSearch(query);

  async function createConversation(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sohbet oluşturulamadı.");
      onCreated(data.conversation.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function toggleSelect(user: UserDTO) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
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
          <h2 className="font-display text-lg font-bold">Yeni Sohbet</h2>
          <button onClick={onClose} className="text-xl hover:opacity-70" style={{ color: "var(--muted)" }}>
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-5 pt-4">
          {(["dm", "group"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition"
              style={
                tab === t
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--panel2)", color: "var(--muted)" }
              }
            >
              {t === "dm" ? "Kişi" : "Grup"}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {tab === "group" && (
            <>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Grup adı"
                maxLength={60}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
                style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => toggleSelect(u)}
                      className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      {displayName(u)} ✕
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="İsim veya telefon numarası ara..."
            autoFocus
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ background: "var(--panel2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />

          {searching && <p className="text-center text-sm" style={{ color: "var(--muted)" }}>Aranıyor...</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
              Kullanıcı bulunamadı. Numaranın kayıtlı olduğundan emin ol.
            </p>
          )}
          {query.trim().length < 2 && results.length === 0 && (
            <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
              Aramak için en az 2 karakter yaz.
            </p>
          )}

          <div className="space-y-1">
            {results.map((user) => {
              const isSelected = selected.some((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  disabled={busy}
                  onClick={() =>
                    tab === "dm"
                      ? createConversation({ type: "dm", userId: user.id })
                      : toggleSelect(user)
                  }
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:opacity-90"
                  style={{ background: isSelected ? "var(--accent-soft)" : "transparent" }}
                >
                  <Avatar src={user.avatarUrl} name={displayName(user)} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{displayName(user)}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--muted)" }}>{user.phone}</span>
                  </span>
                  {tab === "group" && (
                    <span
                      className="flex size-5 items-center justify-center rounded-full border text-xs"
                      style={
                        isSelected
                          ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" }
                          : { borderColor: "var(--border)" }
                      }
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "group" && (
          <div className="p-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              disabled={busy || !groupName.trim() || selected.length === 0}
              onClick={() =>
                createConversation({
                  type: "group",
                  name: groupName,
                  memberIds: selected.map((u) => u.id),
                })
              }
              className="w-full rounded-lg py-2.5 font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Oluşturuluyor..." : `Grup Oluştur (${selected.length} üye)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
