import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export const AUTH_COOKIE = "bosschat_token";
const SESSION_DAYS = 30;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    // Prod'da JWT_SECRET zorunlu: yoksa herkesin bildiği varsayılan anahtarla
    // token imzalanır ve taklit edilebilir (auth bypass). Erken ve net patla.
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET tanımlı değil. Production'da bu değişken zorunludur.");
    }
    return new TextEncoder().encode("dev-secret-change-me-in-production");
  }
  return new TextEncoder().encode(value);
}

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionUser(): Promise<User | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
