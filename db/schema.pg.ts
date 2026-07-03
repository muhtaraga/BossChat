import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// PostgreSQL şeması — db/schema.sqlite.ts ile birebir aynı tablo/kolon adları.
// Postgres'e geçiş: db/schema.ts içindeki re-export satırını bu dosyaya çevir,
// DATABASE_URL'i postgres:// yap, "npm run db:migrate" çalıştır.
export const dialect = "postgresql" as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  statusMessage: text("status_message").default("Merhaba! BossChat kullanıyorum."),
  // Kullanıcı tercihleri (bildirim/gizlilik/görünüm) JSON string olarak tutulur.
  settings: text("settings").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("otp_phone_idx").on(t.phone)],
);

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  type: text("type", { enum: ["dm", "group"] }).notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("member_unique_idx").on(t.conversationId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ["text", "image", "file"] })
      .notNull()
      .default("text"),
    content: text("content"),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("message_conv_idx").on(t.conversationId, t.id)],
);

export const blocks = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => users.id),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("block_unique_idx").on(t.blockerId, t.blockedId),
    index("block_blocker_idx").on(t.blockerId),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationMember = typeof conversationMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
