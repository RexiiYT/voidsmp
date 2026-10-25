import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { BugReport, InsertBugReport, InsertReviewCase, InsertStaffAccount, InsertUser, bugReports, reviewCases, staffAccounts, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getStaffAccountByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(staffAccounts).where(eq(staffAccounts.email, email.toLowerCase())).limit(1);
  return result[0];
}

export async function listStaffAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: staffAccounts.id, email: staffAccounts.email, name: staffAccounts.name, role: staffAccounts.role, createdAt: staffAccounts.createdAt }).from(staffAccounts).orderBy(desc(staffAccounts.createdAt));
}

export async function createStaffAccount(account: InsertStaffAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(staffAccounts).values({ ...account, email: account.email.toLowerCase() });
  return getStaffAccountByEmail(account.email);
}

export async function updateStaffAccountRole(id: number, role: "admin" | "manager" | "owner" | "tester") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffAccounts).set({ role }).where(eq(staffAccounts.id, id));
  return db.select({ id: staffAccounts.id, email: staffAccounts.email, name: staffAccounts.name, role: staffAccounts.role, createdAt: staffAccounts.createdAt }).from(staffAccounts).where(eq(staffAccounts.id, id)).limit(1).then((rows) => rows[0]);
}

export async function updateStaffAccountPassword(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(staffAccounts).set({ passwordHash }).where(eq(staffAccounts.id, id));
  return result[0].affectedRows > 0;
}

export async function createReviewCase(review: InsertReviewCase) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(reviewCases).values(review);
  return Number(result[0].insertId);
}

export async function getReviewCaseByContentHash(contentHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ id: reviewCases.id, adminName: reviewCases.adminName, adminEmail: reviewCases.adminEmail, originalName: reviewCases.originalName, createdAt: reviewCases.createdAt }).from(reviewCases).where(eq(reviewCases.contentHash, contentHash)).limit(1);
  return result[0];
}

export async function updateReviewCase(id: number, values: Partial<InsertReviewCase>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(reviewCases).set(values).where(eq(reviewCases.id, id));
}

export async function listReviewCases(status?: "processing" | "pending_review" | "approved" | "rejected") {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(reviewCases).orderBy(desc(reviewCases.createdAt));
  return status ? query.where(eq(reviewCases.status, status)) : query;
}

export async function createBugReport(report: InsertBugReport) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(bugReports).values(report);
  return Number(result[0].insertId);
}

export async function listBugReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bugReports).orderBy(desc(bugReports.createdAt));
}

export async function updateBugReport(id: number, values: Partial<BugReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(bugReports).set(values).where(eq(bugReports.id, id));
  return db.select().from(bugReports).where(eq(bugReports.id, id)).limit(1).then((rows) => rows[0]);
}
