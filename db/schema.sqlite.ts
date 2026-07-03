import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// SQLite şeması. Postgres karşılığı: db/schema.pg.ts (aynı tablo/kolon adları).
// db/index.ts bu sabit üzerinden doğru sürücüyle eşleştiğini doğrular.
export const dialect = "sqlite" as const;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  statusMessage: text("status_message").default("Merhaba! BossChat kullanıyorum."),
  // Kullanıcı tercihleri (bildirim/gizlilik/görünüm) JSON string olarak tutulur.
  settings: text("settings").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
});

export const otpCodes = sqliteTable(
  "otp_codes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("otp_phone_idx").on(t.phone)],
);

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["dm", "group"] }).notNull(),
  name: text("name"), // sadece gruplar için
  avatarUrl: text("avatar_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const conversationMembers = sqliteTable(
  "conversation_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("member_unique_idx").on(t.conversationId, t.userId),
    index("member_user_idx").on(t.userId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
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
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("message_conv_idx").on(t.conversationId, t.id)],
);

export const blocks = sqliteTable(
  "blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => users.id),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("block_unique_idx").on(t.blockerId, t.blockedId),
    index("block_blocker_idx").on(t.blockerId),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
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
