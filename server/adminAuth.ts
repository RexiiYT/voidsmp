import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { Express, Request, Response } from "express";
import * as db from "./db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "modpoints_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type AdminRole = "owner" | "manager" | "admin" | "tester";
type AdminSession = { email: string; name: string; role: AdminRole };

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

async function createSession(session: AdminSession) {
  const secret = new TextEncoder().encode(requiredEnv("APP_SESSION_SECRET"));
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

export async function readSession(req: Request): Promise<AdminSession | null> {
  const token = parseCookie(req.headers.cookie ?? "")[SESSION_COOKIE];
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(requiredEnv("APP_SESSION_SECRET"));
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload.role !== "owner" && payload.role !== "manager" && payload.role !== "admin" && payload.role !== "tester") return null;
    if (typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    return { email: payload.email, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

function setSessionCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=None`);
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`);
}

function cleanEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function registerAdminAuthRoutes(app: Express) {
  app.post("/api/admin/login", async (req, res) => {
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });

    const ownerEmail = cleanEmail(process.env.ADMIN_EMAIL);
    const ownerPassword = process.env.ADMIN_PASSWORD ?? "";
    let session: AdminSession | null = null;
    if (email === ownerEmail && ownerPassword && password === ownerPassword) {
      session = { email: ownerEmail, name: "مالك النظام", role: "owner" };
    } else {
      const account = await db.getStaffAccountByEmail(email);
      if (account && await verifyPassword(password, account.passwordHash)) {
        session = { email: account.email, name: account.name, role: account.role };
      }
    }
    if (!session) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
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
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "owner") return res.status(403).json({ error: "هذه العملية متاحة للمالك فقط" });
    const accounts = await db.listStaffAccounts();
    res.json({ owner: { email: requiredEnv("ADMIN_EMAIL"), name: "مالك النظام", role: "owner" }, accounts });
  });

  app.post("/api/admin/accounts", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "owner") return res.status(403).json({ error: "إنشاء الحسابات متاح للمالك فقط" });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = cleanEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (name.length < 2 || !email.includes("@") || password.length < 10) {
      return res.status(400).json({ error: "أدخل اسمًا صحيحًا وبريدًا صالحًا وكلمة مرور من 10 أحرف على الأقل" });
    }
    try {
      const account = await db.createStaffAccount({ email, name, passwordHash: await hashPassword(password), role: "admin" });
      return res.status(201).json({ account: account ? { id: account.id, email: account.email, name: account.name, role: account.role, createdAt: account.createdAt } : null });
    } catch (error: any) {
      if (String(error?.code) === "ER_DUP_ENTRY") return res.status(409).json({ error: "هذا البريد مستخدم بالفعل" });
      console.error("[AdminAuth] failed to create account", error);
      return res.status(500).json({ error: "تعذر إنشاء الحساب الآن" });
    }
  });

  app.patch("/api/admin/accounts/:id/role", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "owner") return res.status(403).json({ error: "تعديل الرتب متاح للمالك فقط" });
    const role = req.body?.role;
    if (role !== "admin" && role !== "manager" && role !== "owner" && role !== "tester") return res.status(400).json({ error: "الرتبة غير صالحة" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "معرّف الحساب غير صالح" });
    const account = await db.updateStaffAccountRole(id, role);
    if (!account) return res.status(404).json({ error: "الحساب غير موجود" });
    return res.json({ account });
  });

  app.patch("/api/admin/accounts/:id/password", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "owner") return res.status(403).json({ error: "تغيير كلمات المرور متاح للمالك فقط" });
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "معرّف الحساب غير صالح" });
    if (password.length < 10) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 10 أحرف على الأقل" });
    const account = await db.updateStaffAccountPassword(id, await hashPassword(password));
    if (!account) return res.status(404).json({ error: "الحساب غير موجود" });
    return res.json({ ok: true });
  });
}
