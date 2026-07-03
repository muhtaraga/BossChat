const AVATAR_PALETTE = [
  "#e07a5f",
  "#e6a54f",
  "#6bbf8a",
  "#7aa6e0",
  "#c98bd6",
  "#e08a7a",
  "#8bb36b",
  "#d99a3c",
];

const SENDER_PALETTE = ["#c0603f", "#b07d1f", "#3f8f5f", "#4a7fc0", "#9a5fb0", "#b06a3f"];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function avatarColor(name: string): string {
  return AVATAR_PALETTE[hash(name) % AVATAR_PALETTE.length];
}

export function senderColor(name: string): string {
  return SENDER_PALETTE[hash(name) % SENDER_PALETTE.length];
}
