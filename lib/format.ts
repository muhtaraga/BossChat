import type { ConversationDTO, UserDTO } from "@/types";

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Bugün";
  if (d.toDateString() === yesterday.toDateString()) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatLastSeen(ms: number | null): string {
  if (!ms) return "çevrimdışı";
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `son görülme bugün ${formatTime(ms)}`;
  return `son görülme ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${formatTime(ms)}`;
}

/** Dosya adı/URL'inden videoyu tespit eder (uzantı bazlı). */
export function isVideoFile(name: string | null): boolean {
  return !!name && /\.(mp4|webm|mov|ogg|m4v)$/i.test(name);
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function displayName(user: UserDTO): string {
  return user.name?.trim() || user.phone;
}

/** DM'de karşı tarafı, grupta grup adını gösterir. */
export function conversationTitle(conv: ConversationDTO, meId: number): string {
  if (conv.type === "group") return conv.name ?? "Grup";
  const other = conv.members.find((m) => m.userId !== meId);
  return other ? displayName(other.user) : "Sohbet";
}

export function conversationAvatar(conv: ConversationDTO, meId: number): string | null {
  if (conv.type === "group") return conv.avatarUrl;
  return conv.members.find((m) => m.userId !== meId)?.user.avatarUrl ?? null;
}
