var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// server/_core/publicConfig.ts
function publicPlatformConfig(env = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? ""
  };
}
function publicPlatformScript(env = process.env) {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll("<", "\\u003c");
  return `window.__MANUS_CONFIG__=${json};`;
}
var init_publicConfig = __esm({
  "server/_core/publicConfig.ts"() {
    "use strict";
  }
});

// server/_core/index.ts
import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "webdev_app_session";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var staffAccounts = mysqlTable("staff_accounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  passwordHash: text("passwordHash").notNull(),
  role: mysqlEnum("role", ["admin", "manager", "owner", "tester"]).default("admin").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var bugReports = mysqlTable("bug_reports", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var reviewCases = mysqlTable("review_cases", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/_core/env.ts
var ENV = {
  get appId() {
    return process.env.MANUS_PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.MANUS_JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.MANUS_OAUTH_API_URL ?? "";
  },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  }
};

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getStaffAccountByEmail(email) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(staffAccounts).where(eq(staffAccounts.email, email.toLowerCase())).limit(1);
  return result[0];
}
async function listStaffAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: staffAccounts.id, email: staffAccounts.email, name: staffAccounts.name, role: staffAccounts.role, createdAt: staffAccounts.createdAt }).from(staffAccounts).orderBy(desc(staffAccounts.createdAt));
}
async function createStaffAccount(account) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(staffAccounts).values({ ...account, email: account.email.toLowerCase() });
  return getStaffAccountByEmail(account.email);
}
async function updateStaffAccountRole(id, role) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(staffAccounts).set({ role }).where(eq(staffAccounts.id, id));
  return db.select({ id: staffAccounts.id, email: staffAccounts.email, name: staffAccounts.name, role: staffAccounts.role, createdAt: staffAccounts.createdAt }).from(staffAccounts).where(eq(staffAccounts.id, id)).limit(1).then((rows) => rows[0]);
}
async function updateStaffAccountPassword(id, passwordHash) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(staffAccounts).set({ passwordHash }).where(eq(staffAccounts.id, id));
  return result[0].affectedRows > 0;
}
async function createReviewCase(review) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(reviewCases).values(review);
  return Number(result[0].insertId);
}
async function getReviewCaseByContentHash(contentHash) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select({ id: reviewCases.id, adminName: reviewCases.adminName, adminEmail: reviewCases.adminEmail, originalName: reviewCases.originalName, createdAt: reviewCases.createdAt }).from(reviewCases).where(eq(reviewCases.contentHash, contentHash)).limit(1);
  return result[0];
}
async function updateReviewCase(id, values) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(reviewCases).set(values).where(eq(reviewCases.id, id));
}
async function listReviewCases(status) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(reviewCases).orderBy(desc(reviewCases.createdAt));
  return status ? query.where(eq(reviewCases.status, status)) : query;
}
async function createBugReport(report) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(bugReports).values(report);
  return Number(result[0].insertId);
}
async function listBugReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bugReports).orderBy(desc(bugReports.createdAt));
}
async function updateBugReport(id, values) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(bugReports).set(values).where(eq(bugReports.id, id));
  return db.select().from(bugReports).where(eq(bugReports.id, id)).limit(1).then((rows) => rows[0]);
}

// server/_core/cookies.ts
function getSessionCookieOptions(_req) {
  return { httpOnly: true, path: "/", sameSite: "none", secure: true };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured! Set MANUS_OAUTH_API_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) throw new Error("MANUS_JWT_SECRET is unavailable");
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || (!isNonEmptyString(appId) || appId !== ENV.appId) || typeof name !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken && req.path.startsWith("/api/scheduled/")) {
      const ticket = cookies.get("app_session_id");
      const identity = await this.verifySession(ticket);
      if (identity?.openId.startsWith(CRON_OPEN_ID_PREFIX)) sessionToken = ticket;
    }
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/adminAuth.ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { parse as parseCookie } from "cookie";
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
var scrypt = promisify(scryptCallback);
var SESSION_COOKIE = "modpoints_admin_session";
var SESSION_MAX_AGE = 60 * 60 * 24 * 7;
function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
async function createSession(session) {
  const secret = new TextEncoder().encode(requiredEnv("APP_SESSION_SECRET"));
  return new SignJWT2(session).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(session.email).setIssuedAt().setExpirationTime(`${SESSION_MAX_AGE}s`).sign(secret);
}
async function readSession(req) {
  const token = parseCookie(req.headers.cookie ?? "")[SESSION_COOKIE];
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(requiredEnv("APP_SESSION_SECRET"));
    const { payload } = await jwtVerify2(token, secret, { algorithms: ["HS256"] });
    if (payload.role !== "owner" && payload.role !== "manager" && payload.role !== "admin" && payload.role !== "tester") return null;
    if (typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    return { email: payload.email, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=None`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
}
function cleanEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function registerAdminAuthRoutes(app) {
  app.post("/api/admin/login", async (req, res) => {
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0637\u0644\u0648\u0628\u0627\u0646" });
    const ownerEmail = cleanEmail(process.env.ADMIN_EMAIL);
    const ownerPassword = process.env.ADMIN_PASSWORD ?? "";
    let session = null;
    if (email === ownerEmail && ownerPassword && password === ownerPassword) {
      session = { email: ownerEmail, name: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0646\u0638\u0627\u0645", role: "owner" };
    } else {
      const account = await getStaffAccountByEmail(email);
      if (account && await verifyPassword(password, account.passwordHash)) {
        session = { email: account.email, name: account.name, role: account.role };
      }
    }
    if (!session) return res.status(401).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
    setSessionCookie(res, await createSession(session));
    return res.json({ session });
  });
  app.post("/api/admin/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  app.get("/api/admin/session", async (req, res) => {
    const session = await readSession(req);
    res.json({ session });
  });
  app.get("/api/admin/accounts", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "owner") return res.status(403).json({ error: "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0645\u0627\u0644\u0643 \u0641\u0642\u0637" });
    const accounts = await listStaffAccounts();
    res.json({ owner: { email: requiredEnv("ADMIN_EMAIL"), name: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0646\u0638\u0627\u0645", role: "owner" }, accounts });
  });
  app.post("/api/admin/accounts", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "owner") return res.status(403).json({ error: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0645\u062A\u0627\u062D \u0644\u0644\u0645\u0627\u0644\u0643 \u0641\u0642\u0637" });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (name.length < 2 || !email.includes("@") || password.length < 10) {
      return res.status(400).json({ error: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645\u064B\u0627 \u0635\u062D\u064A\u062D\u064B\u0627 \u0648\u0628\u0631\u064A\u062F\u064B\u0627 \u0635\u0627\u0644\u062D\u064B\u0627 \u0648\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0645\u0646 10 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
    }
    try {
      const account = await createStaffAccount({ email, name, passwordHash: await hashPassword(password), role: "admin" });
      return res.status(201).json({ account: account ? { id: account.id, email: account.email, name: account.name, role: account.role, createdAt: account.createdAt } : null });
    } catch (error) {
      if (String(error?.code) === "ER_DUP_ENTRY") return res.status(409).json({ error: "\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644" });
      console.error("[AdminAuth] failed to create account", error);
      return res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0622\u0646" });
    }
  });
  app.patch("/api/admin/accounts/:id/role", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "owner") return res.status(403).json({ error: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0631\u062A\u0628 \u0645\u062A\u0627\u062D \u0644\u0644\u0645\u0627\u0644\u0643 \u0641\u0642\u0637" });
    const role = req.body?.role;
    if (role !== "admin" && role !== "manager" && role !== "owner" && role !== "tester") return res.status(400).json({ error: "\u0627\u0644\u0631\u062A\u0628\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    const account = await updateStaffAccountRole(id, role);
    if (!account) return res.status(404).json({ error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    return res.json({ account });
  });
  app.patch("/api/admin/accounts/:id/password", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "owner") return res.status(403).json({ error: "\u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0627\u062A \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u062A\u0627\u062D \u0644\u0644\u0645\u0627\u0644\u0643 \u0641\u0642\u0637" });
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    if (password.length < 10) return res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 10 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
    const account = await updateStaffAccountPassword(id, await hashPassword(password));
    if (!account) return res.status(404).json({ error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    return res.json({ ok: true });
  });
}

// server/reviews.ts
import { createHash } from "node:crypto";

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set MANUS_API_URL and MANUS_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = await resp.json();
  if (!url) throw new Error("Storage did not return a download URL");
  return url;
}

// server/reviews.ts
var POINTS_BY_ACTION = { ban: 3, kick: 2, mute: 2, timeout: 2, warn: 1, ticket_response: 1 };
var ACTION_LABELS = { ban: "\u062D\u0638\u0631", kick: "\u0637\u0631\u062F", mute: "\u0645\u064A\u0648\u062A", timeout: "\u062A\u0627\u064A\u0645 \u0623\u0648\u062A", warn: "\u062A\u062D\u0630\u064A\u0631", ticket_response: "\u0631\u062F \u062A\u0630\u0643\u0631\u0629 Discord" };
function normalizeActionType(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[ -]/g, "_");
  if (normalized.includes("ticket")) return "ticket_response";
  return Object.prototype.hasOwnProperty.call(POINTS_BY_ACTION, normalized) ? normalized : null;
}
function parseAnalysis(content) {
  if (typeof content !== "string" || !content.trim()) return null;
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence ?? 0)));
    return {
      actionType: normalizeActionType(parsed.actionType),
      targetUser: typeof parsed.targetUser === "string" ? parsed.targetUser.slice(0, 160) : null,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 2e3) : "\u0644\u0645 \u064A\u0642\u062F\u0645 \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0633\u0628\u0628\u064B\u0627 \u0648\u0627\u0636\u062D\u064B\u0627",
      confidence,
      valid: parsed.valid === true
    };
  } catch {
    return null;
  }
}
async function analyzeImage(imageUrl) {
  const apiUrl = process.env.MANUS_API_URL;
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiUrl || !apiKey) throw new Error("\u062E\u062F\u0645\u0629 \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0630\u0643\u064A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627");
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "\u0623\u0646\u062A \u0645\u0631\u0627\u062C\u0639 \u0635\u0648\u0631 \u062A\u0630\u0627\u0643\u0631 Discord \u0648\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629\u060C \u0648\u0644\u064A\u0633 \u0645\u062D\u0644\u0644 Minecraft \u0641\u0642\u0637. \u062D\u0644\u0644 \u0627\u0644\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0631\u0626\u064A\u0629 \u0641\u0642\u0637 \u0648\u0644\u0627 \u062A\u062E\u0645\u0646. \u0627\u0641\u0647\u0645 \u0634\u0643\u0644 \u062A\u0630\u0627\u0643\u0631 Discord: \u0627\u0633\u0645 \u0627\u0644\u0642\u0646\u0627\u0629\u060C \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0630\u0643\u0631\u0629\u060C owner/department/closed/claimed \u0641\u064A \u0634\u0631\u064A\u0637 \u0627\u0644\u0639\u0646\u0648\u0627\u0646\u060C \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0623\u0639\u0636\u0627\u0621\u060C \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646\u060C \u0645\u0646\u0634\u0646 @Staff\u060C \u0623\u0644\u0648\u0627\u0646/\u0623\u062F\u0648\u0627\u0631 \u0627\u0644\u0623\u0639\u0636\u0627\u0621\u060C embeds\u060C \u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0628\u0648\u062A\u060C \u0648\u0627\u0644\u062A\u0648\u0642\u064A\u062A\u0627\u062A. \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0627\u0644\u062A\u0645\u064A\u064A\u0632 \u0628\u064A\u0646 \u062D\u0627\u0644\u062A\u064A\u0646: (1) \u0631\u062F \u0625\u062F\u0627\u0631\u064A \u062D\u0642\u064A\u0642\u064A: \u0631\u0633\u0627\u0644\u0629 \u0628\u0634\u0631\u064A\u0629 \u0645\u0646 \u0625\u062F\u0627\u0631\u064A/Staff \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u062A\u0631\u062F \u0639\u0644\u0649 \u0637\u0644\u0628 \u0627\u0644\u0639\u0636\u0648 \u0623\u0648 \u062A\u0639\u0627\u0644\u062C \u0627\u0644\u0628\u0644\u0627\u063A\u060C \u0648\u0642\u062F \u062A\u0643\u0648\u0646 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0623\u0648 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629\u061B (2) \u0631\u0633\u0627\u0644\u0629 \u0646\u0638\u0627\u0645 \u0623\u0648 \u0628\u0648\u062A \u0641\u0642\u0637 \u0645\u062B\u0644 \xAB\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u0628\u0646\u062C\u0627\u062D\xBB \u0623\u0648 \u0638\u0647\u0648\u0631 claimed/closed \u0623\u0648 \u0631\u0633\u0627\u0644\u0629 Void Tickets\u060C \u0648\u0647\u0630\u0647 \u0644\u064A\u0633\u062A \u0631\u062F\u064B\u0627 \u0625\u062F\u0627\u0631\u064A\u064B\u0627 \u0628\u062D\u062F \u0630\u0627\u062A\u0647\u0627. \u0642\u0627\u0639\u062F\u0629 \u0645\u0647\u0645\u0629 \u062C\u062F\u064B\u0627: \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0627\u0644\u0635\u0648\u0631\u0629 \u0642\u0627\u0626\u0645\u0629 \u0623\u0639\u0636\u0627\u0621/\u0625\u062F\u0627\u0631\u064A\u064A\u0646 \u0641\u064A Discord\u060C \u0645\u062B\u0644 \u0623\u0633\u0645\u0627\u0621 \u0643\u062B\u064A\u0631\u0629 \u0645\u062A\u062A\u0627\u0644\u064A\u0629 \u0645\u0639 \u0635\u0648\u0631 \u0634\u062E\u0635\u064A\u0629 \u0648\u0623\u0632\u0631\u0627\u0631 \u0625\u0632\u0627\u0644\u0629 \u0623\u0648 X\u060C \u0641\u0647\u064A roster \u0641\u0642\u0637 \u0648\u0644\u064A\u0633\u062A \u0633\u062C\u0644 \u0625\u062C\u0631\u0627\u0621. \u0644\u0627 \u062A\u0633\u062A\u062E\u0631\u062C \u0623\u064A \u0627\u0633\u0645 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0643\u0645\u0646\u0641\u0630\u060C \u0648\u0644\u0627 \u062A\u0639\u062A\u0628\u0631\u0647\u0627 \u0631\u062F\u064B\u0627 \u0623\u0648 \u062F\u0644\u064A\u0644\u064B\u0627 \u0639\u0644\u0649 \u0639\u0645\u0644 \u0625\u062F\u0627\u0631\u064A\u060C \u0648\u0623\u0639\u062F valid=false \u0648actionType=null \u0648confidence \u0623\u0642\u0644 \u0645\u0646 10. \u0644\u0627 \u062A\u0639\u062A\u0628\u0631 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0639\u0636\u0648 \u0646\u0641\u0633\u0647 \u0623\u0648 \u0635\u0648\u0631\u0629 Minecraft \u0623\u0648 \u0637\u0644\u0628\u064B\u0627 \u0645\u0646 \u062F\u0648\u0646 \u0631\u062F \u062F\u0644\u064A\u0644\u064B\u0627 \u0639\u0644\u0649 \u0625\u0646\u062C\u0627\u0632 \u0627\u0644\u0645\u0647\u0645\u0629. \u0643\u0630\u0644\u0643 \u062A\u0639\u0631\u0651\u0641 \u0625\u062C\u0631\u0627\u0621\u0627\u062A ban \u0648mute \u0648timeout \u0648warn \u0648kick \u0639\u0646\u062F\u0645\u0627 \u064A\u0638\u0647\u0631 \u062A\u0646\u0641\u064A\u0630\u0647\u0627 \u0628\u0648\u0636\u0648\u062D. \u0623\u0639\u062F JSON \u0635\u0627\u0644\u062D\u064B\u0627 \u0641\u0642\u0637 \u0628\u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D: actionType, targetUser, reason, confidence, valid. actionType \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 ticket_response \u0625\u0630\u0627 \u0638\u0647\u0631 \u0631\u062F \u0625\u062F\u0627\u0631\u064A \u062D\u0642\u064A\u0642\u064A\u060C \u0623\u0648 ban/mute/timeout/warn/kick \u0625\u0630\u0627 \u0638\u0647\u0631 \u0625\u062C\u0631\u0627\u0621 \u0648\u0627\u0636\u062D\u060C \u0623\u0648 null \u0625\u0630\u0627 \u0644\u0645 \u064A\u0648\u062C\u062F \u0625\u0646\u062C\u0627\u0632 \u0642\u0627\u0628\u0644 \u0644\u0644\u0625\u062B\u0628\u0627\u062A. valid=true \u0641\u0642\u0637 \u0625\u0630\u0627 \u0638\u0647\u0631 \u0631\u062F \u0625\u062F\u0627\u0631\u064A \u062D\u0642\u064A\u0642\u064A \u0623\u0648 \u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A \u0645\u0646\u0641\u0630 \u0628\u0648\u0636\u0648\u062D. \u0625\u0630\u0627 \u0638\u0647\u0631\u062A \u0631\u0633\u0627\u0626\u0644 \u0628\u0648\u062A \u0641\u0642\u0637 \u0645\u062B\u0644 \u062A\u0623\u0643\u064A\u062F \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u0641\u0627\u062C\u0639\u0644 valid=false. confidence \u0631\u0642\u0645 \u0635\u062D\u064A\u062D \u0645\u0646 0 \u0625\u0644\u0649 100\u060C \u0648\u0627\u062C\u0639\u0644\u0647\u0627 \u0623\u0642\u0644 \u0645\u0646 80 \u0639\u0646\u062F \u0639\u062F\u0645 \u0648\u0636\u0648\u062D \u0647\u0648\u064A\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u064A \u0623\u0648 \u0639\u062F\u0645 \u0648\u062C\u0648\u062F \u0631\u062F \u0628\u0634\u0631\u064A \u0648\u0627\u0636\u062D." },
        { role: "user", content: [{ type: "text", text: "\u0631\u0627\u062C\u0639 \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629 \u0643\u062A\u0630\u0643\u0631\u0629 Discord. \u0627\u0641\u062D\u0635 \u0634\u0631\u064A\u0637 \u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u0648\u0627\u0644\u0631\u0633\u0627\u0626\u0644 \u0628\u0627\u0644\u062A\u0631\u062A\u064A\u0628: \u0647\u0644 \u0631\u062F \u0625\u062F\u0627\u0631\u064A/Staff \u0628\u0634\u0631\u064A \u0639\u0644\u0649 \u0637\u0644\u0628 \u0627\u0644\u0639\u0636\u0648\u061F \u0623\u0645 \u0627\u0644\u0645\u0648\u062C\u0648\u062F \u0645\u062C\u0631\u062F \u0631\u0633\u0627\u0644\u0629 \u0628\u0648\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u0623\u0648 \u0643\u0644\u0627\u0645 \u0627\u0644\u0639\u0636\u0648 \u0646\u0641\u0633\u0647\u061F \u0625\u0630\u0627 \u0643\u0627\u0646 \u0647\u0646\u0627\u0643 \u0631\u062F \u0625\u062F\u0627\u0631\u064A \u0648\u0627\u0636\u062D \u0627\u0630\u0643\u0631\u0647 \u0643\u0640 ticket_response\u060C \u0648\u0625\u0630\u0627 \u0643\u0627\u0646 \u0647\u0646\u0627\u0643 ban/mute \u0623\u0648 \u0625\u062C\u0631\u0627\u0621 \u0622\u062E\u0631 \u0645\u0646\u0641\u0630 \u0627\u0630\u0643\u0631 \u0646\u0648\u0639\u0647. \u0644\u0627 \u062A\u0645\u0646\u062D \u0627\u0639\u062A\u0645\u0627\u062F\u064B\u0627 \u0644\u0645\u062C\u0631\u062F \u0639\u0628\u0627\u0631\u0629 \u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u0623\u0648 claimed/closed." }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] }
      ]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error?.message ?? "\u062A\u0639\u0630\u0631 \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0635\u0648\u0631\u0629");
  const result = parseAnalysis(body.choices?.[0]?.message?.content);
  if (!result) throw new Error("\u0644\u0645 \u064A\u0631\u062C\u0639 \u0627\u0644\u062A\u062D\u0644\u064A\u0644 \u0646\u062A\u064A\u062C\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u0631\u0627\u0621\u0629");
  return result;
}
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "review-image";
}
function registerReviewRoutes(app) {
  app.get("/api/points", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role === "tester") return res.status(403).json({ error: "\u0647\u0630\u0647 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0631\u062A\u0628\u0629 Tester" });
    const reviews = await listReviewCases();
    const accounts = await listStaffAccounts();
    const allRows = /* @__PURE__ */ new Map();
    const ownerEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
    allRows.set(ownerEmail, { email: ownerEmail, name: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0646\u0638\u0627\u0645", points: 0, approvedCases: 0 });
    for (const account of accounts) allRows.set(account.email.toLowerCase(), { email: account.email, name: account.name, points: 0, approvedCases: 0 });
    for (const review of reviews) {
      const key = review.adminEmail.toLowerCase();
      const existing = allRows.get(key) ?? { email: review.adminEmail, name: review.adminName, points: 0, approvedCases: 0 };
      existing.points += review.pointsGranted ?? 0;
      if (review.status === "approved") existing.approvedCases += 1;
      allRows.set(key, existing);
    }
    const leaderboard = [...allRows.values()].sort((a, b) => b.points - a.points || b.approvedCases - a.approvedCases || a.name.localeCompare(b.name)).slice(0, 10);
    if (session.role === "admin") {
      const ownReviews = reviews.filter((review) => review.adminEmail.toLowerCase() === session.email.toLowerCase());
      const own = ownReviews.reduce((row, review) => {
        row.points += review.pointsGranted ?? 0;
        if (review.status === "approved") row.approvedCases += 1;
        return row;
      }, { email: session.email, name: session.name, points: 0, approvedCases: 0 });
      return res.json({ leaderboard, all: [own] });
    }
    return res.json({ leaderboard, all: [...allRows.values()].sort((a, b) => b.points - a.points || b.approvedCases - a.approvedCases || a.name.localeCompare(b.name)) });
  });
  app.get("/api/tester-stats", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "tester" && session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u0640 Testers \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0631\u062A\u0628\u0629" });
    const accounts = (await listStaffAccounts()).filter((account) => account.role === "tester");
    const reviews = await listReviewCases();
    const rows = /* @__PURE__ */ new Map();
    for (const account of accounts) rows.set(account.email.toLowerCase(), { email: account.email, name: account.name, points: 0, approvedCases: 0, totalCases: 0 });
    for (const review of reviews) {
      const key = review.adminEmail.toLowerCase();
      if (!rows.has(key)) continue;
      const row = rows.get(key);
      row.totalCases += 1;
      row.points += review.pointsGranted ?? 0;
      if (review.status === "approved") row.approvedCases += 1;
    }
    const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.approvedCases - a.approvedCases || a.name.localeCompare(b.name));
    const own = sorted.find((tester) => tester.email.toLowerCase() === session.email.toLowerCase()) ?? { email: session.email, name: session.name, points: 0, approvedCases: 0, totalCases: 0 };
    return res.json({ own, leaderboard: sorted.slice(0, 5), all: session.role === "tester" ? void 0 : sorted });
  });
  app.get("/api/staff-details", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u064A\u0646 \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0640 Manager \u0648\u0627\u0644\u0640 Owner \u0641\u0642\u0637" });
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "\u0627\u062E\u062A\u0631 \u0625\u062F\u0627\u0631\u064A\u064B\u0627 \u0623\u0648\u0644\u064B\u0627" });
    const ownerEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const accounts = await listStaffAccounts();
    const account = accounts.find((item) => item.email.toLowerCase() === email);
    if (email !== ownerEmail && !account) return res.status(404).json({ error: "\u0627\u0644\u0625\u062F\u0627\u0631\u064A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    const reviews = (await listReviewCases()).filter((review) => review.adminEmail.toLowerCase() === email);
    const byAction = {};
    for (const review of reviews) {
      const key = review.actionType ?? "unknown";
      const current = byAction[key] ?? { label: ACTION_LABELS[key] ?? "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", count: 0, points: 0 };
      current.count += 1;
      current.points += review.pointsGranted ?? 0;
      byAction[key] = current;
    }
    const person = email === ownerEmail ? { email, name: "\u0645\u0627\u0644\u0643 \u0627\u0644\u0646\u0638\u0627\u0645", role: "owner" } : { email, name: account?.name ?? reviews[0]?.adminName ?? email, role: account?.role ?? "admin" };
    return res.json({ person, summary: { totalCases: reviews.length, approvedCases: reviews.filter((review) => review.status === "approved").length, pendingCases: reviews.filter((review) => review.status === "pending_review" || review.status === "processing").length, rejectedCases: reviews.filter((review) => review.status === "rejected").length, points: reviews.reduce((sum, review) => sum + (review.pointsGranted ?? 0), 0), byAction: Object.values(byAction) }, cases: reviews.map((review) => ({ id: review.id, originalName: review.originalName, actionType: review.actionType, actionLabel: ACTION_LABELS[review.actionType ?? ""] ?? "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", targetUser: review.targetUser, reason: review.reason, confidence: review.confidence, pointsGranted: review.pointsGranted, status: review.status, createdAt: review.createdAt, storageUrl: session.role === "owner" ? review.storageUrl : "" })) });
  });
  app.get("/api/reviews", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role === "tester") return res.status(403).json({ error: "\u0627\u0644\u062D\u0627\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0631\u062A\u0628\u0629 Tester" });
    const requested = typeof req.query.status === "string" ? req.query.status : void 0;
    const status = ["processing", "pending_review", "approved", "rejected"].includes(requested ?? "") ? requested : void 0;
    const reviews = await listReviewCases(status);
    const visibleReviews = session.role === "admin" ? reviews.filter((review) => review.adminEmail.toLowerCase() === session.email.toLowerCase()) : reviews;
    const safeReviews = visibleReviews.map((review) => session.role === "owner" ? review : { ...review, storageUrl: "" });
    return res.json({ reviews: safeReviews });
  });
  app.post("/api/reviews", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role === "tester") return res.status(403).json({ error: "\u0631\u0641\u0639 \u0627\u0644\u062D\u0627\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0631\u062A\u0628\u0629 Tester" });
    const originalName = typeof req.body?.fileName === "string" ? req.body.fileName : "review-image";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
    const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimeType) || !dataUrl.startsWith("data:")) return res.status(400).json({ error: "\u0627\u0644\u0645\u0644\u0641 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0635\u0648\u0631\u0629 PNG \u0623\u0648 JPG \u0623\u0648 WEBP" });
    const base64 = dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0642\u0644 \u0645\u0646 10MB" });
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const previous = await getReviewCaseByContentHash(contentHash);
    if (previous) {
      const date = new Date(previous.createdAt).toLocaleString("ar-EG");
      return res.status(409).json({ error: `\u0645\u0631\u0641\u0648\u0636\u0629: \u0647\u0630\u0647 \u0627\u0644\u0635\u0648\u0631\u0629 \u062A\u0645 \u0631\u0641\u0639\u0647\u0627 \u0645\u0646 \u0642\u0628\u0644 \u0628\u0648\u0627\u0633\u0637\u0629 ${previous.adminName} \u0628\u062A\u0627\u0631\u064A\u062E ${date}. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0631\u0641\u0639 \u0646\u0641\u0633 \u0627\u0644\u0635\u0648\u0631\u0629 \u0623\u0643\u062B\u0631 \u0645\u0646 \u0645\u0631\u0629.` });
    }
    const id = await createReviewCase({ adminEmail: session.email, adminName: session.name, originalName: originalName.slice(0, 255), mimeType, contentHash, storageKey: "pending", storageUrl: "", status: "processing", pointsGranted: 0 });
    try {
      const uploaded = await storagePut(`review-cases/${session.email}/${Date.now()}-${safeName(originalName)}`, buffer, mimeType);
      await updateReviewCase(id, { storageKey: uploaded.key, storageUrl: uploaded.url });
      const signedUrl = await storageGetSignedUrl(uploaded.key);
      const analysis = await analyzeImage(signedUrl);
      const approved = analysis.valid && analysis.confidence >= 85;
      const points = approved && analysis.actionType ? POINTS_BY_ACTION[analysis.actionType] ?? 0 : 0;
      await updateReviewCase(id, { status: approved && points > 0 ? "approved" : "pending_review", actionType: analysis.actionType, targetUser: analysis.targetUser, reason: analysis.reason, confidence: analysis.confidence, pointsGranted: points });
      const reviews = await listReviewCases();
      return res.status(201).json({ review: reviews.find((review) => review.id === id) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u062D\u0644\u064A\u0644";
      await updateReviewCase(id, { status: "pending_review", reason, confidence: 0, pointsGranted: 0 });
      const reviews = await listReviewCases();
      return res.status(202).json({ review: reviews.find((review) => review.id === id), warning: reason });
    }
  });
}

// server/bugReports.ts
var statuses = ["open", "in_review", "resolved", "rejected"];
var severities = ["low", "medium", "high", "critical"];
function registerBugReportRoutes(app) {
  app.get("/api/bug-reports", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "tester" && session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "\u0642\u0633\u0645 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A \u0645\u062A\u0627\u062D \u0644\u0644\u0640 Tester \u0648\u0627\u0644\u0640 Manager \u0648\u0627\u0644\u0640 Owner \u0641\u0642\u0637" });
    const reports = await listBugReports();
    return res.json({ reports: session.role === "tester" ? reports.filter((report) => report.reporterEmail.toLowerCase() === session.email.toLowerCase()) : reports });
  });
  app.post("/api/bug-reports", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "tester") return res.status(403).json({ error: "\u0625\u0631\u0633\u0627\u0644 \u0628\u0644\u0627\u063A\u0627\u062A \u0627\u0644\u062C\u0644\u062A\u0634\u0627\u062A \u0645\u062A\u0627\u062D \u0644\u0631\u062A\u0628\u0629 Tester \u0641\u0642\u0637" });
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const severity = severities.includes(req.body?.severity) ? req.body.severity : "medium";
    if (title.length < 3 || title.length > 180 || description.length < 10 || description.length > 5e3) return res.status(400).json({ error: "\u0627\u0643\u062A\u0628 \u0639\u0646\u0648\u0627\u0646\u064B\u0627 \u0648\u0627\u0636\u062D\u064B\u0627 \u0648\u0648\u0635\u0641\u064B\u0627 \u0644\u0627 \u064A\u0642\u0644 \u0639\u0646 10 \u0623\u062D\u0631\u0641" });
    const id = await createBugReport({ reporterEmail: session.email, reporterName: session.name, title, description, severity, status: "open" });
    const reports = await listBugReports();
    return res.status(201).json({ report: reports.find((report) => report.id === id) });
  });
  app.patch("/api/bug-reports/:id", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" });
    if (session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0628\u0644\u0627\u063A\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0640 Manager \u0648\u0627\u0644\u0640 Owner \u0641\u0642\u0637" });
    const id = Number(req.params.id);
    const status = req.body?.status;
    const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim().slice(0, 3e3) : void 0;
    if (!Number.isInteger(id) || id < 1 || !statuses.includes(status)) return res.status(400).json({ error: "\u062D\u0627\u0644\u0629 \u0627\u0644\u0628\u0644\u0627\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" });
    const report = await updateBugReport(id, { status, reviewNote, reviewedBy: session.email, reviewedAt: /* @__PURE__ */ new Date() });
    if (!report) return res.status(404).json({ error: "\u0627\u0644\u0628\u0644\u0627\u063A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    return res.json({ report });
  });
}

// server/_core/index.ts
init_publicConfig();

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/index.ts
async function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  registerAdminAuthRoutes(app);
  registerReviewRoutes(app);
  registerBugReportRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app;
}
if (false) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

// server/vercelHandler.ts
var appPromise;
async function handler(req, res) {
  appPromise ??= createApp();
  const app = await appPromise;
  return app(req, res);
}
export {
  handler as default
};
