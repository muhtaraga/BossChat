import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { getSessionUserId } from "@/lib/auth";
import { getMembership } from "@/lib/conversations";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const { path: parts } = await ctx.params;
  const filePath = path.resolve(UPLOAD_DIR, ...parts);
  // Path traversal koruması
  if (!filePath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
    return NextResponse.json({ error: "Geçersiz yol." }, { status: 400 });
  }

  // Yetki: dosya bir mesaj ekiyse yalnızca o sohbetin üyeleri erişebilir.
  // Avatarlar (kullanıcı/grup) giriş yapmış herkese açıktır. Hiçbir yerde
  // referanslı olmayan dosya (henüz mesaja iliştirilmemiş) dışarıya sızmaz.
  const requestedUrl = `/api/files/${parts.join("/")}`;
  const [msg] = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.fileUrl, requestedUrl))
    .limit(1);
  if (msg) {
    const membership = await getMembership(msg.conversationId, userId);
    if (!membership) {
      return NextResponse.json({ error: "Bu dosyaya erişiminiz yok." }, { status: 403 });
    }
  } else {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.avatarUrl, requestedUrl))
      .limit(1);
    let isAvatar = !!u;
    if (!isAvatar) {
      const [c] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.avatarUrl, requestedUrl))
        .limit(1);
      isAvatar = !!c;
    }
    if (!isAvatar) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
    }
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
  }
}
