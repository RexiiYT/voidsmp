import type { Express } from "express";
import { createHash } from "node:crypto";
import * as db from "./db";
import { readSession } from "./adminAuth";
import { storageGetSignedUrl, storagePut } from "./storage";

const POINTS_BY_ACTION: Record<string, number> = { ban: 3, kick: 2, mute: 2, timeout: 2, warn: 1, ticket_response: 1 };
const ACTION_LABELS: Record<string, string> = { ban: "حظر", kick: "طرد", mute: "ميوت", timeout: "تايم أوت", warn: "تحذير", ticket_response: "رد تذكرة Discord" };
type Analysis = { actionType: string | null; targetUser: string | null; reason: string; confidence: number; valid: boolean };

function normalizeActionType(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[ -]/g, "_");
  if (normalized.includes("ticket")) return "ticket_response";
  return Object.prototype.hasOwnProperty.call(POINTS_BY_ACTION, normalized) ? normalized : null;
}

function parseAnalysis(content: unknown): Analysis | null {
  if (typeof content !== "string" || !content.trim()) return null;
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<Analysis>;
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence ?? 0)));
    return {
      actionType: normalizeActionType(parsed.actionType),
      targetUser: typeof parsed.targetUser === "string" ? parsed.targetUser.slice(0, 160) : null,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 2000) : "لم يقدم التحليل سببًا واضحًا",
      confidence,
      valid: parsed.valid === true,
    };
  } catch {
    return null;
  }
}

async function analyzeImage(imageUrl: string): Promise<Analysis> {
  const apiUrl = process.env.MANUS_API_URL;
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiUrl || !apiKey) throw new Error("خدمة التحليل الذكي غير متاحة حاليًا");
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "أنت مراجع صور تذاكر Discord وسجلات الإدارة، وليس محلل Minecraft فقط. حلل الصورة المرئية فقط ولا تخمن. افهم شكل تذاكر Discord: اسم القناة، عنوان التذكرة، owner/department/closed/claimed في شريط العنوان، رسائل الأعضاء، رسائل الموظفين، منشن @Staff، ألوان/أدوار الأعضاء، embeds، أزرار البوت، والتوقيتات. المطلوب التمييز بين حالتين: (1) رد إداري حقيقي: رسالة بشرية من إداري/Staff داخل التذكرة ترد على طلب العضو أو تعالج البلاغ، وقد تكون بالعربية أو الإنجليزية؛ (2) رسالة نظام أو بوت فقط مثل «تم استلام التذكرة بنجاح» أو ظهور claimed/closed أو رسالة Void Tickets، وهذه ليست ردًا إداريًا بحد ذاتها. قاعدة مهمة جدًا: إذا كانت الصورة قائمة أعضاء/إداريين في Discord، مثل أسماء كثيرة متتالية مع صور شخصية وأزرار إزالة أو X، فهي roster فقط وليست سجل إجراء. لا تستخرج أي اسم من هذه القائمة كمنفذ، ولا تعتبرها ردًا أو دليلًا على عمل إداري، وأعد valid=false وactionType=null وconfidence أقل من 10. لا تعتبر رسالة العضو نفسه أو صورة Minecraft أو طلبًا من دون رد دليلًا على إنجاز المهمة. كذلك تعرّف إجراءات ban وmute وtimeout وwarn وkick عندما يظهر تنفيذها بوضوح. أعد JSON صالحًا فقط بالمفاتيح: actionType, targetUser, reason, confidence, valid. actionType يجب أن يكون ticket_response إذا ظهر رد إداري حقيقي، أو ban/mute/timeout/warn/kick إذا ظهر إجراء واضح، أو null إذا لم يوجد إنجاز قابل للإثبات. valid=true فقط إذا ظهر رد إداري حقيقي أو إجراء إداري منفذ بوضوح. إذا ظهرت رسائل بوت فقط مثل تأكيد استلام التذكرة فاجعل valid=false. confidence رقم صحيح من 0 إلى 100، واجعلها أقل من 80 عند عدم وضوح هوية الإداري أو عدم وجود رد بشري واضح." },
        { role: "user", content: [{ type: "text", text: "راجع هذه الصورة كتذكرة Discord. افحص شريط التذكرة والرسائل بالترتيب: هل رد إداري/Staff بشري على طلب العضو؟ أم الموجود مجرد رسالة بوت تلقائية أو كلام العضو نفسه؟ إذا كان هناك رد إداري واضح اذكره كـ ticket_response، وإذا كان هناك ban/mute أو إجراء آخر منفذ اذكر نوعه. لا تمنح اعتمادًا لمجرد عبارة تم استلام التذكرة أو claimed/closed." }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] },
      ],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error?.message ?? "تعذر تحليل الصورة");
  const result = parseAnalysis(body.choices?.[0]?.message?.content);
  if (!result) throw new Error("لم يرجع التحليل نتيجة قابلة للقراءة");
  return result;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "review-image";
}

export function registerReviewRoutes(app: Express) {
  app.get("/api/points", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role === "tester") return res.status(403).json({ error: "هذه الأقسام غير متاحة لرتبة Tester" });
    const reviews = await db.listReviewCases();
    const accounts = await db.listStaffAccounts();
    const allRows = new Map<string, { email: string; name: string; points: number; approvedCases: number }>();
    const ownerEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
    allRows.set(ownerEmail, { email: ownerEmail, name: "مالك النظام", points: 0, approvedCases: 0 });
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
      const own = ownReviews.reduce((row, review) => { row.points += review.pointsGranted ?? 0; if (review.status === "approved") row.approvedCases += 1; return row; }, { email: session.email, name: session.name, points: 0, approvedCases: 0 });
      return res.json({ leaderboard, all: [own] });
    }
    return res.json({ leaderboard, all: [...allRows.values()].sort((a, b) => b.points - a.points || b.approvedCases - a.approvedCases || a.name.localeCompare(b.name)) });
  });

  app.get("/api/tester-stats", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "tester" && session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "إحصائيات الـ Testers غير متاحة لهذه الرتبة" });
    const accounts = (await db.listStaffAccounts()).filter((account) => account.role === "tester");
    const reviews = await db.listReviewCases();
    const rows = new Map<string, { email: string; name: string; points: number; approvedCases: number; totalCases: number }>();
    for (const account of accounts) rows.set(account.email.toLowerCase(), { email: account.email, name: account.name, points: 0, approvedCases: 0, totalCases: 0 });
    for (const review of reviews) {
      const key = review.adminEmail.toLowerCase();
      if (!rows.has(key)) continue;
      const row = rows.get(key)!;
      row.totalCases += 1;
      row.points += review.pointsGranted ?? 0;
      if (review.status === "approved") row.approvedCases += 1;
    }
    const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.approvedCases - a.approvedCases || a.name.localeCompare(b.name));
    const own = sorted.find((tester) => tester.email.toLowerCase() === session.email.toLowerCase()) ?? { email: session.email, name: session.name, points: 0, approvedCases: 0, totalCases: 0 };
    return res.json({ own, leaderboard: sorted.slice(0, 5), all: session.role === "tester" ? undefined : sorted });
  });

  app.get("/api/staff-details", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "تفاصيل الإداريين متاحة للـ Manager والـ Owner فقط" });
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "اختر إداريًا أولًا" });
    const ownerEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    const accounts = await db.listStaffAccounts();
    const account = accounts.find((item) => item.email.toLowerCase() === email);
    if (email !== ownerEmail && !account) return res.status(404).json({ error: "الإداري غير موجود" });
    const reviews = (await db.listReviewCases()).filter((review) => review.adminEmail.toLowerCase() === email);
    const byAction: Record<string, { label: string; count: number; points: number }> = {};
    for (const review of reviews) {
      const key = review.actionType ?? "unknown";
      const current = byAction[key] ?? { label: ACTION_LABELS[key] ?? "غير مصنف", count: 0, points: 0 };
      current.count += 1;
      current.points += review.pointsGranted ?? 0;
      byAction[key] = current;
    }
    const person = email === ownerEmail ? { email, name: "مالك النظام", role: "owner" } : { email, name: account?.name ?? reviews[0]?.adminName ?? email, role: account?.role ?? "admin" };
    return res.json({ person, summary: { totalCases: reviews.length, approvedCases: reviews.filter((review) => review.status === "approved").length, pendingCases: reviews.filter((review) => review.status === "pending_review" || review.status === "processing").length, rejectedCases: reviews.filter((review) => review.status === "rejected").length, points: reviews.reduce((sum, review) => sum + (review.pointsGranted ?? 0), 0), byAction: Object.values(byAction) }, cases: reviews.map((review) => ({ id: review.id, originalName: review.originalName, actionType: review.actionType, actionLabel: ACTION_LABELS[review.actionType ?? ""] ?? "غير مصنف", targetUser: review.targetUser, reason: review.reason, confidence: review.confidence, pointsGranted: review.pointsGranted, status: review.status, createdAt: review.createdAt, storageUrl: session.role === "owner" ? review.storageUrl : "" })) });
  });

  app.get("/api/reviews", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role === "tester") return res.status(403).json({ error: "الحالات غير متاحة لرتبة Tester" });
    const requested = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = ["processing", "pending_review", "approved", "rejected"].includes(requested ?? "") ? requested as "processing" | "pending_review" | "approved" | "rejected" : undefined;
    const reviews = await db.listReviewCases(status);
    const visibleReviews = session.role === "admin" ? reviews.filter((review) => review.adminEmail.toLowerCase() === session.email.toLowerCase()) : reviews;
    const safeReviews = visibleReviews.map((review) => session.role === "owner" ? review : { ...review, storageUrl: "" });
    return res.json({ reviews: safeReviews });
  });

  app.post("/api/reviews", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role === "tester") return res.status(403).json({ error: "رفع الحالات غير متاح لرتبة Tester" });
    const originalName = typeof req.body?.fileName === "string" ? req.body.fileName : "review-image";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";
    const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(mimeType) || !dataUrl.startsWith("data:")) return res.status(400).json({ error: "الملف يجب أن يكون صورة PNG أو JPG أو WEBP" });
    const base64 = dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: "حجم الصورة يجب أن يكون أقل من 10MB" });
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const previous = await db.getReviewCaseByContentHash(contentHash);
    if (previous) {
      const date = new Date(previous.createdAt).toLocaleString("ar-EG");
      return res.status(409).json({ error: `مرفوضة: هذه الصورة تم رفعها من قبل بواسطة ${previous.adminName} بتاريخ ${date}. لا يمكن رفع نفس الصورة أكثر من مرة.` });
    }

    const id = await db.createReviewCase({ adminEmail: session.email, adminName: session.name, originalName: originalName.slice(0, 255), mimeType, contentHash, storageKey: "pending", storageUrl: "", status: "processing", pointsGranted: 0 });
    try {
      const uploaded = await storagePut(`review-cases/${session.email}/${Date.now()}-${safeName(originalName)}`, buffer, mimeType);
      await db.updateReviewCase(id, { storageKey: uploaded.key, storageUrl: uploaded.url });
      const signedUrl = await storageGetSignedUrl(uploaded.key);
      const analysis = await analyzeImage(signedUrl);
      const approved = analysis.valid && analysis.confidence >= 85;
      const points = approved && analysis.actionType ? POINTS_BY_ACTION[analysis.actionType] ?? 0 : 0;
      await db.updateReviewCase(id, { status: approved && points > 0 ? "approved" : "pending_review", actionType: analysis.actionType, targetUser: analysis.targetUser, reason: analysis.reason, confidence: analysis.confidence, pointsGranted: points });
      const reviews = await db.listReviewCases();
      return res.status(201).json({ review: reviews.find((review) => review.id === id) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "تعذر إكمال التحليل";
      await db.updateReviewCase(id, { status: "pending_review", reason, confidence: 0, pointsGranted: 0 });
      const reviews = await db.listReviewCases();
      return res.status(202).json({ review: reviews.find((review) => review.id === id), warning: reason });
    }
  });
}
