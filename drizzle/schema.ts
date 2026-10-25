import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const staffAccounts = mysqlTable("staff_accounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  passwordHash: text("passwordHash").notNull(),
  role: mysqlEnum("role", ["admin", "manager", "owner", "tester"]).default("admin").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;

export const bugReports = mysqlTable("bug_reports", {
  id: int("id").autoincrement().primaryKey(),
  reporterEmail: varchar("reporterEmail", { length: 320 }).notNull(),
  reporterName: varchar("reporterName", { length: 160 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "in_review", "resolved", "rejected"]).default("open").notNull(),
  reviewNote: text("reviewNote"),
  reviewedBy: varchar("reviewedBy", { length: 320 }),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type InsertBugReport = typeof bugReports.$inferInsert;

export const reviewCases = mysqlTable("review_cases", {
  id: int("id").autoincrement().primaryKey(),
  adminEmail: varchar("adminEmail", { length: 320 }).notNull(),
  adminName: varchar("adminName", { length: 160 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  contentHash: varchar("contentHash", { length: 64 }),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
  status: mysqlEnum("status", ["processing", "pending_review", "approved", "rejected"]).default("processing").notNull(),
  actionType: varchar("actionType", { length: 80 }),
  targetUser: varchar("targetUser", { length: 160 }),
  reason: text("reason"),
  confidence: int("confidence"),
  pointsGranted: int("pointsGranted").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReviewCase = typeof reviewCases.$inferSelect;
export type InsertReviewCase = typeof reviewCases.$inferInsert;
