import type { Express } from "express";
import * as db from "./db";
import { readSession } from "./adminAuth";

const statuses = ["open", "in_review", "resolved", "rejected"] as const;
const severities = ["low", "medium", "high", "critical"] as const;

export function registerBugReportRoutes(app: Express) {
  app.get("/api/bug-reports", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "tester" && session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "قسم البلاغات متاح للـ Tester والـ Manager والـ Owner فقط" });
    const reports = await db.listBugReports();
    return res.json({ reports: session.role === "tester" ? reports.filter((report) => report.reporterEmail.toLowerCase() === session.email.toLowerCase()) : reports });
  });

  app.post("/api/bug-reports", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "tester") return res.status(403).json({ error: "إرسال بلاغات الجلتشات متاح لرتبة Tester فقط" });
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const severity = severities.includes(req.body?.severity) ? req.body.severity : "medium";
    if (title.length < 3 || title.length > 180 || description.length < 10 || description.length > 5000) return res.status(400).json({ error: "اكتب عنوانًا واضحًا ووصفًا لا يقل عن 10 أحرف" });
    const id = await db.createBugReport({ reporterEmail: session.email, reporterName: session.name, title, description, severity, status: "open" });
    const reports = await db.listBugReports();
    return res.status(201).json({ report: reports.find((report) => report.id === id) });
  });

  app.patch("/api/bug-reports/:id", async (req, res) => {
    const session = await readSession(req);
    if (!session) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (session.role !== "manager" && session.role !== "owner") return res.status(403).json({ error: "مراجعة البلاغات متاحة للـ Manager والـ Owner فقط" });
    const id = Number(req.params.id);
    const status = req.body?.status;
    const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim().slice(0, 3000) : undefined;
    if (!Number.isInteger(id) || id < 1 || !statuses.includes(status)) return res.status(400).json({ error: "حالة البلاغ غير صالحة" });
    const report = await db.updateBugReport(id, { status, reviewNote, reviewedBy: session.email, reviewedAt: new Date() });
    if (!report) return res.status(404).json({ error: "البلاغ غير موجود" });
    return res.json({ report });
  });
}
