import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getSessionUserId } from "@/lib/auth";

// Dosyalar yerel diske yazılır (uploads/). S3'e taşımak için sadece bu
// route'taki saklama kısmını ve app/api/files sunucusunu değiştirmek yeterli.
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "Dosya boş." }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Dosya 20MB'den büyük olamaz." }, { status: 413 });
  }

  const ext = path.extname(file.name).slice(0, 12).replace(/[^.\w]/g, "");
  const stored = `${randomUUID()}${ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, stored), Buffer.from(await file.arrayBuffer()));

  const isImage = /^image\/(png|jpe?g|gif|webp|avif)$/i.test(file.type);
  return NextResponse.json({
    url: `/api/files/${stored}`,
    name: file.name,
    size: file.size,
    mime: file.type,
    kind: isImage ? "image" : "file",
  });
}
