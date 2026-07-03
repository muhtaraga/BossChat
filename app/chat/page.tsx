"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatWindow from "@/components/ChatWindow";
import GroupInfoModal from "@/components/GroupInfoModal";
import NewChatModal from "@/components/NewChatModal";
import SettingsModal from "@/components/SettingsModal";
import Sidebar from "@/components/Sidebar";
import Toasts, { type Toast } from "@/components/Toasts";
import { disconnectSocket, useSocket } from "@/hooks/useSocket";
import { applyAppearance } from "@/lib/appearance";
import { displayName } from "@/lib/format";
import { subscribePush, unsubscribePush } from "@/lib/pushClient";
import { playPing } from "@/lib/sound";
import type { ConversationDTO, MessageDTO, UserDTO, UserSettings } from "@/types";

interface MessagesState {
  list: MessageDTO[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
}

type Modal = "none" | "new" | "settings" | "info";

function sortConvs(list: ConversationDTO[]): ConversationDTO[] {
  return [...list].sort(
    (a, b) =>
      (b.lastMessage?.createdAt ?? b.createdAt) - (a.lastMessage?.createdAt ?? a.createdAt),
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { socket, connected } = useSocket();

  const [me, setMe] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messagesByConv, setMessagesByConv] = useState<Record<number, MessagesState>>({});
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [typingMap, setTypingMap] = useState<Record<number, Record<number, string>>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<Modal>("none");
  const [settingsTab, setSettingsTab] = useState<
    "account" | "notifications" | "privacy" | "appearance"
  >("account");

  const activeIdRef = useRef<number | null>(null);
  const meRef = useRef<UserDTO | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  activeIdRef.current = activeId;
  meRef.current = me;

  // ---- İlk yükleme ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meRes = await fetch("/api/me");
      if (meRes.status === 401) {
        router.replace("/login");
        return;
      }
      const meData = await meRes.json();
      const convRes = await fetch("/api/conversations");
      const convData = await convRes.json();
      if (cancelled) return;
      setMe(meData.user);
      // Görünüm tercihini DB'den uygula (çapraz cihaz senkronu + localStorage önbelleği).
      if (meData.user?.settings?.appearance) applyAppearance(meData.user.settings.appearance);
      setConversations(sortConvs(convData.conversations ?? []));
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Daha önce izin verilmiş cihazlarda Web Push aboneliğini tazele.
  // İzin isteme/aç-kapa artık Ayarlar > Bildirimler'den yönetilir.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      void subscribePush();
    }
  }, []);

  // Ayar güncelle (Sidebar hızlı tema düğmesi vb.) — kalıcılaştır + görünümü uygula.
  const updateMySettings = useCallback(
    async (partial: { appearance?: Partial<UserSettings["appearance"]> }) => {
      try {
        const res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: partial }),
        });
        const data = await res.json();
        if (res.ok) {
          setMe(data.user);
          if (partial.appearance) applyAppearance(data.user.settings.appearance);
        }
      } catch {
        /* yoksay */
      }
    },
    [],
  );

  // ---- Yardımcılar ----
  const upsertConversation = useCallback((conv: ConversationDTO) => {
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== conv.id);
      return sortConvs([...rest, conv]);
    });
  }, []);

  const refetchConversation = useCallback(
    async (conversationId: number) => {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (!res.ok) return;
      const data = await res.json();
      upsertConversation(data.conversation);
    },
    [upsertConversation],
  );

  // Düzenlenen/silinen mesajı hem mesaj listesinde hem sohbet önizlemesinde güncelle
  const applyUpdatedMessage = useCallback((message: MessageDTO) => {
    setMessagesByConv((prev) => {
      const cur = prev[message.conversationId];
      if (!cur?.loaded) return prev;
      return {
        ...prev,
        [message.conversationId]: {
          ...cur,
          list: cur.list.map((m) => (m.id === message.id ? message : m)),
        },
      };
    });
    setConversations((prev) =>
      prev.map((c) =>
        c.id === message.conversationId && c.lastMessage?.id === message.id
          ? { ...c, lastMessage: message }
          : c,
      ),
    );
  }, []);

  const markRead = useCallback(
    (conversationId: number, lastMessageId: number) => {
      if (lastMessageId <= 0) return;
      socket.emit("read", { conversationId, messageId: lastMessageId });
      const myId = meRef.current?.id;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                unreadCount: 0,
                members: c.members.map((m) =>
                  m.userId === myId
                    ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, lastMessageId) }
                    : m,
                ),
              }
            : c,
        ),
      );
    },
    [socket],
  );

  const loadMessages = useCallback(async (conversationId: number, before?: number) => {
    setMessagesByConv((prev) => {
      const cur = prev[conversationId];
      if (before && cur) {
        return { ...prev, [conversationId]: { ...cur, loadingOlder: true } };
      }
      return prev;
    });
    const url = new URL(`/api/conversations/${conversationId}/messages`, location.origin);
    if (before) url.searchParams.set("before", String(before));
    const res = await fetch(url);
    if (!res.ok) return;
    const data: { messages: MessageDTO[]; hasMore: boolean } = await res.json();
    setMessagesByConv((prev) => {
      const cur = prev[conversationId] ?? {
        list: [],
        hasMore: true,
        loaded: false,
        loadingOlder: false,
      };
      const existingIds = new Set(cur.list.map((m) => m.id));
      const incoming = data.messages.filter((m) => !existingIds.has(m.id));
      return {
        ...prev,
        [conversationId]: {
          list: before ? [...incoming, ...cur.list] : [...incoming, ...cur.list],
          hasMore: data.hasMore,
          loaded: true,
          loadingOlder: false,
        },
      };
    });
  }, []);

  const selectConversation = useCallback(
    (conversationId: number) => {
      setActiveId(conversationId);
      const state = messagesByConv[conversationId];
      if (!state?.loaded) {
        void loadMessages(conversationId);
      }
    },
    [messagesByConv, loadMessages],
  );

  // Aktif sohbetteki son mesajı okundu işaretle
  useEffect(() => {
    if (!activeId || !me) return;
    const list = messagesByConv[activeId]?.list ?? [];
    const lastReal = [...list].reverse().find((m) => m.id > 0);
    if (!lastReal) return;
    const conv = conversations.find((c) => c.id === activeId);
    const myMember = conv?.members.find((m) => m.userId === me.id);
    if (
      conv &&
      (conv.unreadCount > 0 || (myMember && myMember.lastReadMessageId < lastReal.id))
    ) {
      markRead(activeId, lastReal.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, messagesByConv, me?.id]);

  // ---- Socket event'leri ----
  useEffect(() => {
    const onMessageNew = ({ message }: { message: MessageDTO }) => {
      const convId = message.conversationId;
      const myId = meRef.current?.id;

      setMessagesByConv((prev) => {
        const cur = prev[convId];
        if (!cur?.loaded) return prev;
        if (cur.list.some((m) => m.id === message.id)) return prev;
        return { ...prev, [convId]: { ...cur, list: [...cur.list, message] } };
      });

      setConversations((prev) => {
        const conv = prev.find((c) => c.id === convId);
        if (!conv) {
          // Bilinmeyen sohbet (ör. yeni eklendik) — detayını çek
          void refetchConversation(convId);
          return prev;
        }
        const isActive = activeIdRef.current === convId && !document.hidden;
        return sortConvs(
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  lastMessage: message,
                  unreadCount:
                    message.senderId === myId || isActive ? c.unreadCount : c.unreadCount + 1,
                  members: c.members.map((m) =>
                    m.userId === message.senderId
                      ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, message.id) }
                      : m,
                  ),
                }
              : c,
          ),
        );
      });

      // Gönderen yazmayı bırakmış demektir
      setTypingMap((prev) => {
        const conv = prev[convId];
        if (!conv?.[message.senderId]) return prev;
        const { [message.senderId]: _removed, ...rest } = conv;
        return { ...prev, [convId]: rest };
      });

      // Bildirim: aktif olmayan sohbet veya arka plandaki sekme (ayarlara göre)
      const inactive = activeIdRef.current !== convId || document.hidden;
      if (message.senderId !== myId && inactive) {
        const notif = meRef.current?.settings.notifications;
        const title = displayName(message.sender);
        const fullBody =
          message.type === "text"
            ? (message.content ?? "")
            : message.type === "image"
              ? "📷 Resim"
              : `📄 ${message.fileName ?? "Dosya"}`;
        const body = notif?.preview === false ? "Yeni mesaj" : fullBody;

        if (notif?.desktop !== false) {
          const toastId = Date.now() + Math.random();
          setToasts((prev) => [...prev.slice(-3), { id: toastId, title, body, conversationId: convId }]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 5000);
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
            new Notification(title, { body, tag: `conv-${convId}` });
          }
        }
        if (notif?.sound) playPing();
      }
    };

    const onMessageUpdated = ({ message }: { message: MessageDTO }) =>
      applyUpdatedMessage(message);

    const onTyping = ({
      conversationId,
      userId,
      name,
      isTyping,
    }: {
      conversationId: number;
      userId: number;
      name: string;
      isTyping: boolean;
    }) => {
      const key = `${conversationId}:${userId}`;
      const timer = typingTimers.current.get(key);
      if (timer) clearTimeout(timer);
      if (isTyping) {
        typingTimers.current.set(
          key,
          setTimeout(() => {
            setTypingMap((prev) => {
              const conv = { ...(prev[conversationId] ?? {}) };
              delete conv[userId];
              return { ...prev, [conversationId]: conv };
            });
          }, 5000),
        );
      }
      setTypingMap((prev) => {
        const conv = { ...(prev[conversationId] ?? {}) };
        if (isTyping) conv[userId] = name;
        else delete conv[userId];
        return { ...prev, [conversationId]: conv };
      });
    };

    const onRead = ({
      conversationId,
      userId,
      messageId,
    }: {
      conversationId: number;
      userId: number;
      messageId: number;
    }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                members: c.members.map((m) =>
                  m.userId === userId
                    ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, messageId) }
                    : m,
                ),
              }
            : c,
        ),
      );
    };

    const onPresence = ({
      userId,
      online,
      lastSeenAt,
    }: {
      userId: number;
      online: boolean;
      lastSeenAt: number | null;
    }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
      if (!online && lastSeenAt) {
        setConversations((prev) =>
          prev.map((c) => ({
            ...c,
            members: c.members.map((m) =>
              m.userId === userId ? { ...m, user: { ...m.user, lastSeenAt } } : m,
            ),
          })),
        );
      }
    };

    const onPresenceInit = ({ onlineUserIds }: { onlineUserIds: number[] }) => {
      setOnlineIds(new Set(onlineUserIds));
    };

    const onUserUpdated = ({ user }: { user: UserDTO }) => {
      // Kendi diğer sekmelerini senkronla
      if (user.id === meRef.current?.id) setMe(user);
      // Sohbet üyelerindeki profil bilgisini güncelle
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((m) => (m.userId === user.id ? { ...m, user } : m)),
        })),
      );
      // Mesaj balonlarındaki gönderen bilgisini de güncelle (grup isim/avatar)
      setMessagesByConv((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [cid, state] of Object.entries(prev)) {
          const list = state.list.map((msg) =>
            msg.senderId === user.id ? { ...msg, sender: user } : msg,
          );
          if (list.some((msg, i) => msg !== state.list[i])) changed = true;
          next[Number(cid)] = { ...state, list };
        }
        return changed ? next : prev;
      });
    };

    const onConvNew = ({ conversation }: { conversation: ConversationDTO }) => {
      upsertConversation(conversation);
    };

    const onConvUpdated = ({ conversationId }: { conversationId: number }) => {
      void refetchConversation(conversationId);
    };

    const onConvRemoved = ({ conversationId }: { conversationId: number }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeIdRef.current === conversationId) setActiveId(null);
    };

    socket.on("message:new", onMessageNew);
    socket.on("message:updated", onMessageUpdated);
    socket.on("typing", onTyping);
    socket.on("read", onRead);
    socket.on("presence", onPresence);
    socket.on("presence:init", onPresenceInit);
    socket.on("conversation:new", onConvNew);
    socket.on("conversation:updated", onConvUpdated);
    socket.on("conversation:removed", onConvRemoved);
    socket.on("user:updated", onUserUpdated);
    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("message:updated", onMessageUpdated);
      socket.off("typing", onTyping);
      socket.off("read", onRead);
      socket.off("presence", onPresence);
      socket.off("presence:init", onPresenceInit);
      socket.off("conversation:new", onConvNew);
      socket.off("conversation:updated", onConvUpdated);
      socket.off("conversation:removed", onConvRemoved);
      socket.off("user:updated", onUserUpdated);
    };
  }, [socket, refetchConversation, upsertConversation, applyUpdatedMessage]);

  // ---- Mesaj gönderme ----
  const sendMessage = useCallback(
    (payload: {
      type: "text" | "image" | "file";
      content?: string;
      fileUrl?: string;
      fileName?: string;
      fileSize?: number;
    }) => {
      const convId = activeIdRef.current;
      const myself = meRef.current;
      if (!convId || !myself) return;

      const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: MessageDTO = {
        id: -Date.now(),
        conversationId: convId,
        senderId: myself.id,
        sender: myself,
        type: payload.type,
        content: payload.content ?? null,
        fileUrl: payload.fileUrl ?? null,
        fileName: payload.fileName ?? null,
        fileSize: payload.fileSize ?? null,
        editedAt: null,
        deletedAt: null,
        createdAt: Date.now(),
      };

      setMessagesByConv((prev) => {
        const cur = prev[convId] ?? { list: [], hasMore: false, loaded: true, loadingOlder: false };
        return { ...prev, [convId]: { ...cur, list: [...cur.list, temp] } };
      });

      socket.emit("message:send", { conversationId: convId, tempId, ...payload }, (res) => {
        setMessagesByConv((prev) => {
          const cur = prev[convId];
          if (!cur) return prev;
          if (res.ok && res.message) {
            const real = res.message;
            return {
              ...prev,
              [convId]: {
                ...cur,
                list: cur.list.map((m) => (m.id === temp.id ? real : m)),
              },
            };
          }
          // Başarısız — geçici mesajı kaldır
          return {
            ...prev,
            [convId]: { ...cur, list: cur.list.filter((m) => m.id !== temp.id) },
          };
        });
        if (res.ok && res.message) {
          const real = res.message;
          setConversations((prev) =>
            sortConvs(
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      lastMessage: real,
                      members: c.members.map((m) =>
                        m.userId === myself.id
                          ? { ...m, lastReadMessageId: Math.max(m.lastReadMessageId, real.id) }
                          : m,
                      ),
                    }
                  : c,
              ),
            ),
          );
        } else if (!res.ok) {
          const toastId = Date.now() + Math.random();
          setToasts((prev) => [
            ...prev,
            { id: toastId, title: "Hata", body: res.error ?? "Mesaj gönderilemedi.", conversationId: convId },
          ]);
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 5000);
        }
      });
    },
    [socket],
  );

  const sendFile = useCallback(
    async (file: File, caption?: string) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        const toastId = Date.now() + Math.random();
        setToasts((prev) => [
          ...prev,
          {
            id: toastId,
            title: "Yükleme hatası",
            body: data.error ?? "Dosya yüklenemedi.",
            conversationId: activeIdRef.current ?? 0,
          },
        ]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 5000);
        return;
      }
      sendMessage({
        type: data.kind === "image" ? "image" : "file",
        content: caption?.trim() || undefined,
        fileUrl: data.url,
        fileName: data.name,
        fileSize: data.size,
      });
    },
    [sendMessage],
  );

  const showErrorToast = useCallback((title: string, body: string) => {
    const toastId = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id: toastId, title, body, conversationId: 0 }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toastId)), 5000);
  }, []);

  const editMessage = useCallback(
    (messageId: number, content: string) => {
      socket.emit("message:edit", { messageId, content }, (res) => {
        if (res.ok && res.message) applyUpdatedMessage(res.message);
        else showErrorToast("Hata", res.error ?? "Mesaj düzenlenemedi.");
      });
    },
    [socket, applyUpdatedMessage, showErrorToast],
  );

  const deleteMessage = useCallback(
    (messageId: number) => {
      socket.emit("message:delete", { messageId }, (res) => {
        if (res.ok && res.message) applyUpdatedMessage(res.message);
        else showErrorToast("Hata", res.error ?? "Mesaj silinemedi.");
      });
    },
    [socket, applyUpdatedMessage, showErrorToast],
  );

  const logout = useCallback(async () => {
    // Bu cihazın push aboneliğini kaldır (başarısız olsa da çıkışı engelleme)
    await unsubscribePush();
    await fetch("/api/auth/logout", { method: "POST" });
    disconnectSocket();
    router.replace("/login");
  }, [router]);

  // Hesap silindikten sonra (çerez sunucuda temizlendi): oturumu kapat.
  const handleDeleted = useCallback(async () => {
    await unsubscribePush();
    disconnectSocket();
    router.replace("/login");
  }, [router]);

  // ---- Render ----
  if (loading || !me) {
    return (
      <main className="flex h-dvh items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center" style={{ color: "var(--muted)" }}>
          <div
            className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <p className="text-sm">Yükleniyor...</p>
        </div>
      </main>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? (messagesByConv[activeId] ?? null) : null;

  return (
    <main className="flex h-dvh overflow-hidden gap-4 p-4" style={{ background: "var(--bg)" }}>
      {/* Mobilde: sohbet açıkken liste gizlenir */}
      <div className={`${activeConv ? "hidden md:flex" : "flex"} w-full md:w-auto`}>
        <Sidebar
          me={me}
          conversations={conversations}
          activeId={activeId}
          onlineIds={onlineIds}
          typingMap={typingMap}
          connected={connected}
          onSelect={selectConversation}
          onNewChat={() => setModal("new")}
          onOpenSettings={() => {
            setSettingsTab("account");
            setModal("settings");
          }}
          onOpenGeneralSettings={() => {
            setSettingsTab("appearance");
            setModal("settings");
          }}
          onToggleTheme={(dark) =>
            void updateMySettings({ appearance: { theme: dark ? "dark" : "light" } })
          }
        />
      </div>

      {activeConv ? (
        <ChatWindow
          conversation={activeConv}
          meId={me.id}
          messages={activeMessages?.list ?? []}
          hasMore={activeMessages?.hasMore ?? false}
          loadingOlder={activeMessages?.loadingOlder ?? false}
          onLoadOlder={() => {
            const first = activeMessages?.list.find((m) => m.id > 0);
            if (first) void loadMessages(activeConv.id, first.id);
          }}
          onSendText={(text) => sendMessage({ type: "text", content: text })}
          onSendFile={sendFile}
          onEditMessage={editMessage}
          onDeleteMessage={deleteMessage}
          onTyping={(isTyping) => {
            // Gizlilik: "yazıyor" göstergesi kapalıysa gönderme.
            if (me.settings.privacy.typingIndicator) {
              socket.emit("typing", { conversationId: activeConv.id, isTyping });
            }
          }}
          typingUsers={Object.entries(typingMap[activeConv.id] ?? {})
            .filter(([uid]) => Number(uid) !== me.id)
            .map(([, name]) => name)}
          onlineIds={onlineIds}
          onBack={() => setActiveId(null)}
          onOpenInfo={() => setModal("info")}
          showReadReceipts={me.settings.privacy.readReceipts}
          enterToSend={me.settings.appearance.enterToSend}
        />
      ) : (
        <section
          className="hidden flex-1 flex-col items-center justify-center overflow-hidden md:flex"
          style={{ background: "var(--panel)", borderRadius: "var(--radius, 26px)", boxShadow: "var(--shadow)", color: "var(--muted)" }}
        >
          <span className="mb-3 text-6xl">💬</span>
          <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>BossChat</h2>
          <p className="mt-1 text-sm">Mesajlaşmaya başlamak için bir sohbet seç.</p>
        </section>
      )}

      {modal === "new" && (
        <NewChatModal
          onClose={() => setModal("none")}
          onCreated={(id) => {
            setModal("none");
            // conversation:new event'i listeye ekler; yine de emin olmak için çek
            void refetchConversation(id).then(() => selectConversation(id));
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          me={me}
          initialTab={settingsTab}
          onClose={() => setModal("none")}
          onUpdated={setMe}
          onLogout={logout}
          onDeleted={handleDeleted}
        />
      )}
      {modal === "info" && activeConv && (
        <GroupInfoModal
          conversation={activeConv}
          meId={me.id}
          onlineIds={onlineIds}
          onClose={() => setModal("none")}
          onLeft={() => {
            setModal("none");
            setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
            setActiveId(null);
          }}
        />
      )}

      <Toasts
        toasts={toasts}
        onOpen={(convId, toastId) => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
          if (convId > 0) selectConversation(convId);
        }}
        onDismiss={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))}
      />
    </main>
  );
}
