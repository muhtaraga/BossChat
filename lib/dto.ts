import type { User, Message } from "@/db/schema";
import { DEFAULT_SETTINGS, type UserDTO, type UserSettings, type MessageDTO } from "@/types";

/**
 * users.settings (JSON string) → UserSettings. Eksik/eski/bozuk alanlar
 * DEFAULT_SETTINGS ile güvenli şekilde doldurulur (derin birleştirme).
 * Hem DTO katmanı hem socket sunucusu kullanır.
 */
export function parseSettings(raw: string | null | undefined): UserSettings {
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  const p = (parsed ?? {}) as Partial<UserSettings>;
  return {
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(p.notifications ?? {}) },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(p.privacy ?? {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(p.appearance ?? {}) },
  };
}

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    avatarUrl: u.avatarUrl,
    statusMessage: u.statusMessage,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.getTime() : null,
    settings: parseSettings(u.settings),
  };
}

export function toMessageDTO(m: Message, sender: User): MessageDTO {
  const deleted = m.deletedAt != null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    sender: toUserDTO(sender),
    type: m.type,
    // Silinen mesajın içeriği/dosyası istemciye sızmaz
    content: deleted ? null : m.content,
    fileUrl: deleted ? null : m.fileUrl,
    fileName: deleted ? null : m.fileName,
    fileSize: deleted ? null : m.fileSize,
    editedAt: m.editedAt ? m.editedAt.getTime() : null,
    deletedAt: m.deletedAt ? m.deletedAt.getTime() : null,
    createdAt: m.createdAt.getTime(),
  };
}
