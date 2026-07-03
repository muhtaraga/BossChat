// Client ve server tarafında ortak kullanılan DTO ve socket event tipleri.

// ---- Kullanıcı ayarları ----

export type ThemePref = "light" | "dark" | "system";
export type FontScale = "sm" | "md" | "lg";
export type Density = "compact" | "comfortable";

export interface UserSettings {
  notifications: {
    desktop: boolean; // masaüstü/tarayıcı bildirimi ve toast
    sound: boolean; // yeni mesajda ses
    preview: boolean; // bildirimde mesaj içeriğini göster
  };
  privacy: {
    readReceipts: boolean; // okundu bilgisi (iki yönlü)
    lastSeen: boolean; // son görülme / çevrimiçi görünürlüğü
    typingIndicator: boolean; // yazıyor göstergesi
  };
  appearance: {
    theme: ThemePref;
    fontScale: FontScale;
    density: Density;
    wallpaper: string; // preset anahtarı: "default" | "none" | "grid" | ...
    enterToSend: boolean;
  };
}

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: { desktop: true, sound: true, preview: true },
  privacy: { readReceipts: true, lastSeen: true, typingIndicator: true },
  appearance: {
    theme: "system",
    fontScale: "md",
    density: "comfortable",
    wallpaper: "default",
    enterToSend: true,
  },
};

export interface UserDTO {
  id: number;
  phone: string;
  name: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  lastSeenAt: number | null; // epoch ms
  settings: UserSettings;
}

export interface MemberDTO {
  userId: number;
  role: "admin" | "member";
  lastReadMessageId: number;
  user: UserDTO;
}

export type MessageType = "text" | "image" | "file";

export interface MessageDTO {
  id: number;
  conversationId: number;
  senderId: number;
  sender: UserDTO;
  type: MessageType;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  editedAt: number | null; // epoch ms
  deletedAt: number | null; // epoch ms (soft delete)
  createdAt: number; // epoch ms
}

export interface ConversationDTO {
  id: number;
  type: "dm" | "group";
  name: string | null;
  avatarUrl: string | null;
  createdBy: number | null;
  createdAt: number;
  members: MemberDTO[];
  lastMessage: MessageDTO | null;
  unreadCount: number;
}

// ---- Socket.io event haritaları ----

export interface SendMessagePayload {
  conversationId: number;
  type: MessageType;
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  tempId: string; // optimistic UI eşleştirmesi için
}

export interface SendMessageAck {
  ok: boolean;
  error?: string;
  message?: MessageDTO;
  tempId: string;
}

export interface MessageActionAck {
  ok: boolean;
  error?: string;
  message?: MessageDTO;
}

export interface ClientToServerEvents {
  "message:send": (payload: SendMessagePayload, ack: (res: SendMessageAck) => void) => void;
  "message:edit": (
    payload: { messageId: number; content: string },
    ack: (res: MessageActionAck) => void,
  ) => void;
  "message:delete": (
    payload: { messageId: number },
    ack: (res: MessageActionAck) => void,
  ) => void;
  typing: (payload: { conversationId: number; isTyping: boolean }) => void;
  read: (payload: { conversationId: number; messageId: number }) => void;
}

export interface ServerToClientEvents {
  "message:new": (payload: { message: MessageDTO; tempId?: string }) => void;
  "message:updated": (payload: { message: MessageDTO }) => void;
  typing: (payload: { conversationId: number; userId: number; name: string; isTyping: boolean }) => void;
  read: (payload: { conversationId: number; userId: number; messageId: number }) => void;
  presence: (payload: { userId: number; online: boolean; lastSeenAt: number | null }) => void;
  "presence:init": (payload: { onlineUserIds: number[] }) => void;
  "conversation:new": (payload: { conversation: ConversationDTO }) => void;
  "conversation:updated": (payload: { conversationId: number }) => void;
  "conversation:removed": (payload: { conversationId: number }) => void;
  "user:updated": (payload: { user: UserDTO }) => void;
}
