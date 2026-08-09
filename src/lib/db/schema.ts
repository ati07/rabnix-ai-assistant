import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/**
 * Multi-tenant schema for the WhatsApp AI assistant.
 *
 * Every business is a `tenant` (mapped to a Clerk Organization). All
 * business-owned rows carry `tenantId` and must always be queried with a
 * tenant filter — that is the isolation boundary for the whole app.
 *
 * ITERATION 1: knowledge retrieval uses Postgres built-in full-text search over
 * `document_chunks.content` (a GIN index), so no `pgvector` extension is
 * required. Semantic vector search can be added later by reintroducing an
 * `embedding vector(N)` column + an ANN index.
 */

// ── Enums ────────────────────────────────────────────────────────────────
export const businessTypeEnum = pgEnum("business_type", [
  "clinic",
  "real_estate",
  "school",
  "shop",
  "restaurant",
  "other",
]);

export const channelTypeEnum = pgEnum("channel_type", [
  "baileys",
  "cloud_api",
  "web",
]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "disconnected",
  "connecting",
  "needs_qr",
  "connected",
  "error",
]);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "open",
  "needs_human",
  // A human agent has actively taken over this conversation — the AI stops
  // auto-replying until it's handed back to "open".
  "human",
  "closed",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "processing",
  "ready",
  "error",
]);

export const llmProviderEnum = pgEnum("llm_provider", [
  "gemini",
  "anthropic",
  "openai",
]);

export const staffRoleEnum = pgEnum("staff_role", ["owner", "staff"]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const appointmentSourceEnum = pgEnum("appointment_source", [
  "ai",
  "staff",
  "customer",
]);

export const reminderTargetEnum = pgEnum("reminder_target", ["customer", "staff"]);

export const notifyChannelEnum = pgEnum("notify_channel", [
  "whatsapp",
  "email",
  "dashboard",
]);

export const reminderStatusEnum = pgEnum("reminder_status", [
  "pending",
  "sent",
  "failed",
  "cancelled",
]);

// ── Tenants ──────────────────────────────────────────────────────────────
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkOrgId: text("clerk_org_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_clerk_org_id_idx").on(t.clerkOrgId),
    uniqueIndex("tenants_slug_idx").on(t.slug),
  ],
);

// ── Users (local mirror of Clerk users; for attribution / human handoff) ──
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_clerk_user_id_idx").on(t.clerkUserId)],
);

// ── Business config (the "logic" the AI understands) ─────────────────────
export const businessConfig = pgTable(
  "business_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessType: businessTypeEnum("business_type").notNull().default("other"),
    displayName: text("display_name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    /** Free-form persona/tone instructions for the assistant. */
    persona: text("persona"),
    /** Structured opening hours, e.g. { mon: [["09:00","17:00"]], ... } */
    hours: jsonb("hours").$type<Record<string, [string, string][]>>().default({}),
    /** Services / products offered: [{ name, description, price, duration }] */
    services: jsonb("services").$type<ServiceItem[]>().default([]),
    /** Quick FAQs: [{ q, a }] */
    faqs: jsonb("faqs").$type<FaqItem[]>().default([]),
    /** Free-form policies (cancellation, returns, etc.) */
    policies: text("policies"),
    /** ISO language codes the assistant may reply in. */
    languages: jsonb("languages").$type<string[]>().default(["en"]),
    /** Optional full override of the generated system prompt. */
    systemPromptOverride: text("system_prompt_override"),
    /** Which LLM this tenant uses. */
    llmProvider: llmProviderEnum("llm_provider").notNull().default("gemini"),
    llmModel: text("llm_model"),
    /** Turn the AI auto-reply on/off without disconnecting WhatsApp. */
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("business_config_tenant_id_idx").on(t.tenantId)],
);

export type ServiceItem = {
  name: string;
  description?: string;
  price?: string;
  duration?: string;
};
export type FaqItem = { q: string; a: string };

// ── WhatsApp connections ─────────────────────────────────────────────────
export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelType: channelTypeEnum("channel_type").notNull().default("baileys"),
    status: connectionStatusEnum("status").notNull().default("disconnected"),
    phoneNumber: text("phone_number"),
    displayName: text("display_name"),
    /** Current pairing QR string (set while status = needs_qr; cleared on connect). */
    qrCode: text("qr_code"),
    /** Baileys auth state (multi-file creds serialized). Sensitive. */
    sessionData: jsonb("session_data"),
    /** Cloud API config (phoneNumberId, wabaId, verifyToken, encrypted token). */
    cloudApiConfig: jsonb("cloud_api_config").$type<CloudApiConfig | null>(),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whatsapp_connections_tenant_id_idx").on(t.tenantId)],
);

export type CloudApiConfig = {
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  accessTokenCipher: string;
};

// ── Web chat widget (embeddable chatbot channel) ──────────────────────────
// One row per tenant. The embeddable widget resolves the tenant by `publicKey`
// (a rotatable, non-secret id used in the embed snippet and public /api/chat
// routes) — never by tenantId, so internal ids don't leak into customer sites.
export const webChatConfigs = pgTable(
  "web_chat_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Widget on/off. Off = public routes 404 so it can't be used. */
    enabled: boolean("enabled").notNull().default(false),
    /** Public, rotatable id used in the embed snippet + public routes. */
    publicKey: text("public_key").notNull(),
    /** First assistant bubble shown before the visitor types. */
    greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
    /** Launcher/header accent colour (CSS hex). */
    themeColor: text("theme_color").notNull().default("#4f46e5"),
    /** Text on the launcher button. */
    launcherLabel: text("launcher_label").notNull().default("Chat with us"),
    /** Optional origin allow-list; empty = allow any embedding site. */
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("web_chat_configs_tenant_id_idx").on(t.tenantId),
    uniqueIndex("web_chat_configs_public_key_idx").on(t.publicKey),
  ],
);

// ── Documents + chunks (RAG) ─────────────────────────────────────────────
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull().default("upload"), // upload | url | text
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: documentStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_tenant_id_idx").on(t.tenantId)],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_chunks_tenant_id_idx").on(t.tenantId),
    index("document_chunks_document_id_idx").on(t.documentId),
    // Full-text search index over chunk content (built-in FTS, no extension).
    index("document_chunks_content_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.content})`,
    ),
  ],
);

// ── Conversations + messages ─────────────────────────────────────────────
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channelType: channelTypeEnum("channel_type").notNull(),
    /** Customer WhatsApp number (E.164) or channel-specific id. */
    customerId: text("customer_id").notNull(),
    customerName: text("customer_name"),
    status: conversationStatusEnum("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_tenant_channel_customer_idx").on(
      t.tenantId,
      t.channelType,
      t.customerId,
    ),
    index("conversations_tenant_last_msg_idx").on(t.tenantId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** Provider message id (e.g. WhatsApp wamid) for dedup/receipts. */
    externalId: text("external_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_external_id_idx")
      .on(t.tenantId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

// ── CRM: customers ───────────────────────────────────────────────────────
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Primary WhatsApp number (E.164). Unique per tenant. */
    phone: text("phone").notNull(),
    name: text("name"),
    email: text("email"),
    tags: jsonb("tags").$type<string[]>().default([]),
    notes: text("notes"),
    /** Arbitrary owner-defined fields. */
    customFields: jsonb("custom_fields").$type<Record<string, unknown>>().default({}),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_tenant_phone_idx").on(t.tenantId, t.phone)],
);

// ── Staff ────────────────────────────────────────────────────────────────
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Maps to a Clerk user once the staff member accepts an invite. */
    clerkUserId: text("clerk_user_id"),
    name: text("name").notNull(),
    email: text("email"),
    /** WhatsApp number for staff notifications (E.164). */
    phone: text("phone"),
    role: staffRoleEnum("role").notNull().default("staff"),
    /** Channels this staff member receives notifications on. */
    notifyChannels: jsonb("notify_channels")
      .$type<("whatsapp" | "email" | "dashboard")[]>()
      .default(["dashboard"]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_tenant_id_idx").on(t.tenantId)],
);

// ── Appointments ─────────────────────────────────────────────────────────
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Optional assigned staff / resource. */
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    /** Service snapshot (services live in business_config JSON). */
    serviceName: text("service_name").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("scheduled"),
    source: appointmentSourceEnum("source").notNull().default("ai"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_tenant_start_idx").on(t.tenantId, t.startAt),
    index("appointments_customer_idx").on(t.customerId),
    // Prevent double-booking the same staff member at the same start time.
    // (NULL staffId rows are exempt — unassigned appointments aren't constrained.)
    uniqueIndex("appointments_staff_slot_idx")
      .on(t.tenantId, t.staffId, t.startAt)
      .where(sql`${t.status} not in ('cancelled', 'no_show')`),
  ],
);

// ── Reminders (fired by the worker's scheduler) ──────────────────────────
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "cascade",
    }),
    target: reminderTargetEnum("target").notNull(),
    channel: notifyChannelEnum("channel").notNull().default("whatsapp"),
    /** When the scheduler should send this. */
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: reminderStatusEnum("status").notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Scheduler polls: due + pending.
    index("reminders_due_idx").on(t.status, t.sendAt),
    index("reminders_tenant_idx").on(t.tenantId),
  ],
);

// ── Notifications (dashboard feed + record of staff notifications) ───────
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "cascade" }),
    /** e.g. "booking", "handoff", "reminder". */
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    channel: notifyChannelEnum("channel").notNull().default("dashboard"),
    read: boolean("read").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_tenant_read_idx").on(t.tenantId, t.read, t.createdAt)],
);

// ── Relations ────────────────────────────────────────────────────────────
export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  config: one(businessConfig),
  connections: many(whatsappConnections),
  documents: many(documents),
  conversations: many(conversations),
  customers: many(customers),
  staff: many(staff),
  appointments: many(appointments),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  appointments: many(appointments),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }),
  appointments: many(appointments),
  notifications: many(notifications),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [appointments.tenantId],
    references: [tenants.id],
  }),
  customer: one(customers, {
    fields: [appointments.customerId],
    references: [customers.id],
  }),
  staff: one(staff, {
    fields: [appointments.staffId],
    references: [staff.id],
  }),
  reminders: many(reminders),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  tenant: one(tenants, { fields: [reminders.tenantId], references: [tenants.id] }),
  appointment: one(appointments, {
    fields: [reminders.appointmentId],
    references: [appointments.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  staff: one(staff, {
    fields: [notifications.staffId],
    references: [staff.id],
  }),
}));

export const businessConfigRelations = relations(businessConfig, ({ one }) => ({
  tenant: one(tenants, {
    fields: [businessConfig.tenantId],
    references: [tenants.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [conversations.tenantId],
    references: [tenants.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
