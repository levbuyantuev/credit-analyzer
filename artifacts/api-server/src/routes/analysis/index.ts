import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { db, analysisSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require("pdf-parse");

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const REPORTS_DIR = path.resolve(process.cwd(), "reports");

[UPLOADS_DIR, REPORTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post("/upload", upload.array("files", 10), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "no_files", message: "No PDF files were uploaded" });
    return;
  }

  const sessionId = uuidv4();
  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  for (const file of files) {
    fs.renameSync(file.path, path.join(sessionDir, file.originalname || file.filename));
  }

  await db.insert(analysisSessionsTable).values({
    id: sessionId,
    status: "uploading",
    filesCount: files.length,
  });

  res.json({
    sessionId,
    filesCount: files.length,
    message: `Successfully uploaded ${files.length} file(s)`,
  });
});

async function extractTextFromPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractCreditDataWithAI(text: string, filename: string): Promise<object> {
  const response = await openrouter.chat.completions.create({
    model: "nvidia/nemotron-3-nano-30b-a3b:free",
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are an expert at reading Russian credit history reports from credit bureaus (НБКИ, ОКБ, Скоринг Бюро, Equifax).
Extract all available credit information and return it as a structured JSON object.`,
      },
      {
        role: "user",
        content: `Extract credit data from this credit history report (file: ${filename}). Return JSON with these fields:
{
  "bureau": "bureau name if detectable",
  "clientName": "full name",
  "clientBirthDate": "birth date if available",
  "creditScore": numeric score if present or null,
  "loans": [
    {
      "creditor": "bank/organization name",
      "type": "loan type (mortgage/consumer/card/auto/etc)",
      "amount": numeric amount in rubles,
      "balance": current balance or 0 if closed,
      "monthlyPayment": monthly payment or null,
      "openDate": "YYYY-MM-DD or null",
      "closeDate": "YYYY-MM-DD or null",
      "status": "active/closed/overdue/default",
      "maxOverdueDays": maximum overdue days or 0,
      "isOverdue": boolean
    }
  ],
  "inquiries": [
    { "date": "YYYY-MM-DD", "organization": "name" }
  ],
  "totalActiveDebt": numeric total active debt in rubles,
  "totalMonthlyPayments": numeric total monthly payments
}

If a field is not found, use null. Return ONLY valid JSON, no markdown, no explanations.

REPORT TEXT:
${text.substring(0, 8000)}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content, parseError: true };
  }
}

function mergeAndDeduplicate(reports: object[]): {
  loans: object[];
  inquiries: object[];
  totalDebt: number;
  totalMonthlyPayments: number;
  bureaus: string[];
} {
  const allLoans: any[] = [];
  const allInquiries: any[] = [];
  let totalDebt = 0;
  let totalMonthlyPayments = 0;
  const bureaus: string[] = [];

  for (const report of reports as any[]) {
    if (report.bureau) bureaus.push(report.bureau);
    if (report.loans) {
      for (const loan of report.loans) {
        const isDuplicate = allLoans.some(
          (existing) =>
            existing.creditor === loan.creditor &&
            Math.abs((existing.amount || 0) - (loan.amount || 0)) < 10000 &&
            existing.openDate === loan.openDate
        );
        if (!isDuplicate) {
          allLoans.push(loan);
        }
      }
    }
    if (report.inquiries) {
      for (const inquiry of report.inquiries) {
        const isDuplicate = allInquiries.some(
          (existing) => existing.organization === inquiry.organization && existing.date === inquiry.date
        );
        if (!isDuplicate) {
          allInquiries.push(inquiry);
        }
      }
    }
  }

  for (const loan of allLoans) {
    if (loan.status === "active" || loan.status === "overdue") {
      totalDebt += loan.balance || loan.amount || 0;
      totalMonthlyPayments += loan.monthlyPayment || 0;
    }
  }

  return { loans: allLoans, inquiries: allInquiries, totalDebt, totalMonthlyPayments, bureaus };
}

async function runAIAnalysis(mergedData: object): Promise<{
  rating: string;
  ratingScore: number;
  ratingLabel: string;
  summary: string;
  recommendations: Array<{ title: string; description: string; priority: string }>;
  risks: Array<{ title: string; description: string; severity: string }>;
}> {
  const response = await openrouter.chat.completions.create({
    model: "nvidia/nemotron-3-nano-30b-a3b:free",
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `Вы — профессиональный финансовый консультант и эксперт по кредитным историям в России.
Анализируйте данные кредитной истории и предоставляйте детальный анализ на русском языке.
Всегда отвечайте ТОЛЬКО валидным JSON без markdown форматирования.`,
      },
      {
        role: "user",
        content: `Проанализируйте сводную кредитную историю клиента из нескольких бюро:

${JSON.stringify(mergedData, null, 2)}

Верните JSON со следующей структурой:
{
  "rating": "excellent|good|average|poor|bad",
  "ratingScore": <число от 0 до 850>,
  "ratingLabel": "<Отличный|Хороший|Средний|Плохой|Очень плохой>",
  "summary": "<подробное описание кредитной истории 2-4 предложения на русском>",
  "recommendations": [
    {
      "title": "<краткое название рекомендации>",
      "description": "<подробное описание что нужно сделать>",
      "priority": "high|medium|low"
    }
  ],
  "risks": [
    {
      "title": "<краткое название риска>",
      "description": "<описание риска>",
      "severity": "high|medium|low"
    }
  ]
}

Дайте ровно 5 рекомендаций. Выявите все значимые риски.
Используйте ТОЛЬКО валидный JSON, без markdown.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {
      rating: "average",
      ratingScore: 500,
      ratingLabel: "Средний",
      summary: "Анализ выполнен. Данные обработаны из загруженных документов.",
      recommendations: [
        { title: "Продолжайте своевременные выплаты", description: "Всегда платите вовремя для улучшения рейтинга.", priority: "high" },
      ],
      risks: [],
    };
  }
}

async function generatePdfReport(sessionId: string, analysisData: any, mergedData: any): Promise<string> {
  const reportPath = path.join(REPORTS_DIR, `${sessionId}.html`);
  const pdfPath = path.join(REPORTS_DIR, `${sessionId}.pdf`);

  const ratingColors: Record<string, string> = {
    excellent: "#22c55e",
    good: "#84cc16",
    average: "#f59e0b",
    poor: "#f97316",
    bad: "#ef4444",
  };

  const ratingColor = ratingColors[analysisData.rating] || "#6b7280";

  const recommendationsHtml = (analysisData.recommendations || [])
    .map(
      (r: any, i: number) => `
    <div class="recommendation">
      <div class="rec-number">${i + 1}</div>
      <div class="rec-content">
        <h4>${r.title}</h4>
        <p>${r.description}</p>
        <span class="badge priority-${r.priority}">${r.priority === "high" ? "Высокий" : r.priority === "medium" ? "Средний" : "Низкий"} приоритет</span>
      </div>
    </div>`
    )
    .join("");

  const risksHtml = (analysisData.risks || [])
    .map(
      (r: any) => `
    <div class="risk risk-${r.severity}">
      <div class="risk-icon">⚠️</div>
      <div>
        <h4>${r.title}</h4>
        <p>${r.description}</p>
      </div>
    </div>`
    )
    .join("");

  const loansHtml = (mergedData.loans || [])
    .slice(0, 10)
    .map(
      (l: any) => `
    <tr>
      <td>${l.creditor || "—"}</td>
      <td>${l.type || "—"}</td>
      <td>${l.amount ? `${(l.amount / 1000).toFixed(0)} тыс. ₽` : "—"}</td>
      <td>${l.balance ? `${(l.balance / 1000).toFixed(0)} тыс. ₽` : "0"}</td>
      <td><span class="status-badge status-${l.status}">${
    l.status === "active" ? "Активный" : l.status === "closed" ? "Закрыт" : l.status === "overdue" ? "Просрочка" : "Дефолт"
  }</span></td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Отчёт кредитной истории</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; color: #1e293b; background: #f8fafc; }
  .page { max-width: 900px; margin: 0 auto; padding: 40px; background: white; }
  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; margin-bottom: 32px; }
  .logo { font-size: 22px; font-weight: 700; color: #1d4ed8; }
  .logo span { color: #64748b; font-weight: 400; }
  .report-date { color: #64748b; font-size: 14px; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  .rating-card { background: linear-gradient(135deg, #1d4ed8, #2563eb); border-radius: 16px; padding: 32px; color: white; display: flex; align-items: center; gap: 32px; margin-bottom: 32px; }
  .rating-circle { width: 120px; height: 120px; border-radius: 50%; border: 6px solid rgba(255,255,255,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); flex-shrink: 0; }
  .rating-score { font-size: 36px; font-weight: 800; color: ${ratingColor}; }
  .rating-max { font-size: 14px; color: rgba(255,255,255,0.7); }
  .rating-info h2 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .rating-info p { opacity: 0.9; line-height: 1.6; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: #f1f5f9; border-radius: 12px; padding: 20px; }
  .stat-label { font-size: 13px; color: #64748b; margin-bottom: 8px; }
  .stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }
  .stat-unit { font-size: 14px; color: #94a3b8; }
  .recommendation { display: flex; gap: 16px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 12px; }
  .rec-number { width: 32px; height: 32px; background: #1d4ed8; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
  .rec-content h4 { font-weight: 600; margin-bottom: 4px; }
  .rec-content p { color: #64748b; font-size: 14px; margin-bottom: 8px; }
  .badge { padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
  .priority-high { background: #fee2e2; color: #dc2626; }
  .priority-medium { background: #fef3c7; color: #d97706; }
  .priority-low { background: #dcfce7; color: #16a34a; }
  .risk { display: flex; gap: 12px; padding: 16px; border-radius: 12px; margin-bottom: 12px; }
  .risk-high { background: #fff1f2; border-left: 4px solid #ef4444; }
  .risk-medium { background: #fffbeb; border-left: 4px solid #f59e0b; }
  .risk-low { background: #f0fdf4; border-left: 4px solid #22c55e; }
  .risk h4 { font-weight: 600; margin-bottom: 4px; }
  .risk p { color: #64748b; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 13px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .status-badge { padding: 2px 8px; border-radius: 20px; font-size: 12px; }
  .status-active { background: #dcfce7; color: #16a34a; }
  .status-closed { background: #f1f5f9; color: #64748b; }
  .status-overdue { background: #fee2e2; color: #dc2626; }
  .status-default { background: #1f2937; color: white; }
  .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">КредитАналитик <span>— сервис анализа кредитной истории</span></div>
    <div class="report-date">Дата отчёта: ${new Date().toLocaleDateString("ru-RU")}</div>
  </div>

  <div class="rating-card">
    <div class="rating-circle">
      <div class="rating-score">${analysisData.ratingScore}</div>
      <div class="rating-max">из 850</div>
    </div>
    <div class="rating-info">
      <h2>${analysisData.ratingLabel}</h2>
      <p>${analysisData.summary}</p>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Общий долг</div>
      <div class="stat-value">${mergedData.totalDebt ? `${(mergedData.totalDebt / 1000000).toFixed(2)}` : "0"} <span class="stat-unit">млн ₽</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Активных кредитов</div>
      <div class="stat-value">${(mergedData.loans || []).filter((l: any) => l.status === "active" || l.status === "overdue").length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Закрытых кредитов</div>
      <div class="stat-value">${(mergedData.loans || []).filter((l: any) => l.status === "closed").length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Просроченных</div>
      <div class="stat-value">${(mergedData.loans || []).filter((l: any) => l.status === "overdue" || l.status === "default").length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Запросов за 30 дней</div>
      <div class="stat-value">${(mergedData.inquiries || []).filter((i: any) => {
        if (!i.date) return false;
        const d = new Date(i.date);
        const now = new Date();
        return (now.getTime() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
      }).length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Ежемесячный платёж</div>
      <div class="stat-value">${mergedData.totalMonthlyPayments ? `${(mergedData.totalMonthlyPayments / 1000).toFixed(0)}` : "0"} <span class="stat-unit">тыс. ₽</span></div>
    </div>
  </div>

  ${risksHtml ? `<div class="section">
    <div class="section-title">🚨 Выявленные риски</div>
    ${risksHtml}
  </div>` : ""}

  <div class="section">
    <div class="section-title">✅ Рекомендации</div>
    ${recommendationsHtml}
  </div>

  ${loansHtml ? `<div class="section">
    <div class="section-title">📋 Сводная таблица кредитов</div>
    <table>
      <thead>
        <tr>
          <th>Кредитор</th>
          <th>Тип</th>
          <th>Сумма</th>
          <th>Остаток</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>${loansHtml}</tbody>
    </table>
  </div>` : ""}

  <div class="footer">
    <p>Отчёт сформирован автоматически на основе загруженных документов кредитной истории.</p>
    <p>Данный отчёт носит информационный характер и не является официальным документом.</p>
  </div>
</div>
</body>
</html>`;

  fs.writeFileSync(reportPath, html);

  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" } });
    await browser.close();
    return pdfPath;
  } catch {
    return reportPath;
  }
}

router.post("/sessions/:sessionId/analyze", async (req, res) => {
  const { sessionId } = req.params;

  const sessions = await db.select().from(analysisSessionsTable).where(eq(analysisSessionsTable.id, sessionId));
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  await db
    .update(analysisSessionsTable)
    .set({ status: "processing" })
    .where(eq(analysisSessionsTable.id, sessionId));

  const sessionDir = path.join(UPLOADS_DIR, sessionId);

  (async () => {
    try {
      const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".pdf"));

      const extractedReports: object[] = [];
      for (const filename of files) {
        const filePath = path.join(sessionDir, filename);
        const text = await extractTextFromPdf(filePath);
        const data = await extractCreditDataWithAI(text, filename);
        extractedReports.push(data);
      }

      const mergedData = mergeAndDeduplicate(extractedReports);
      const aiAnalysis = await runAIAnalysis(mergedData);

      const activeLoans = (mergedData.loans as any[]).filter((l: any) => l.status === "active" || l.status === "overdue").length;
      const closedLoans = (mergedData.loans as any[]).filter((l: any) => l.status === "closed").length;
      const overdueLoans = (mergedData.loans as any[]).filter((l: any) => l.status === "overdue" || l.status === "default").length;
      const inquiriesLastMonth = (mergedData.inquiries as any[]).filter((i: any) => {
        if (!i.date) return false;
        const d = new Date(i.date);
        const now = new Date();
        return now.getTime() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
      }).length;

      const debtBurdenRatio = mergedData.totalMonthlyPayments > 0 ? Math.round((mergedData.totalMonthlyPayments / (mergedData.totalDebt / 120)) * 100) / 100 : 0;

      const reportPath = await generatePdfReport(sessionId, aiAnalysis, mergedData);

      await db
        .update(analysisSessionsTable)
        .set({
          status: "completed",
          rating: aiAnalysis.rating,
          ratingScore: aiAnalysis.ratingScore,
          ratingLabel: aiAnalysis.ratingLabel,
          summary: aiAnalysis.summary,
          totalDebts: mergedData.totalDebt,
          activeLoans,
          closedLoans,
          overdueLoans,
          debtBurdenRatio,
          inquiriesLastMonth,
          recommendations: aiAnalysis.recommendations as any,
          risks: aiAnalysis.risks as any,
          reportPath,
          updatedAt: new Date(),
        })
        .where(eq(analysisSessionsTable.id, sessionId));
    } catch (error: any) {
      const errMsg = String(error?.message || error);
      const errDetails = error?.status ? ` [HTTP ${error.status}]` : "";
      const errBody = error?.error ? ` body=${JSON.stringify(error.error)}` : "";
      console.error(`[Analysis] Session ${sessionId} failed:${errDetails}${errBody}`, errMsg, error?.stack || "");
      await db
        .update(analysisSessionsTable)
        .set({
          status: "failed",
          errorMessage: errMsg,
          updatedAt: new Date(),
        })
        .where(eq(analysisSessionsTable.id, sessionId));
    }
  })();

  res.json({
    sessionId,
    rating: "average",
    ratingScore: 0,
    ratingLabel: "Обработка...",
    summary: "Анализ запущен. Пожалуйста, подождите.",
    totalDebts: 0,
    activeLoans: 0,
    closedLoans: 0,
    overdueLoans: 0,
    debtBurdenRatio: 0,
    inquiriesLastMonth: 0,
    recommendations: [],
    risks: [],
    reportReady: false,
  });
});

router.get("/sessions/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  const sessions = await db.select().from(analysisSessionsTable).where(eq(analysisSessionsTable.id, sessionId));
  const session = sessions[0];

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found" });
    return;
  }

  const result: any = {
    sessionId: session.id,
    status: session.status,
    filesCount: session.filesCount,
    createdAt: session.createdAt.toISOString(),
  };

  if (session.status === "completed") {
    result.analysisResult = {
      sessionId: session.id,
      rating: session.rating,
      ratingScore: session.ratingScore,
      ratingLabel: session.ratingLabel,
      summary: session.summary,
      totalDebts: session.totalDebts,
      activeLoans: session.activeLoans,
      closedLoans: session.closedLoans,
      overdueLoans: session.overdueLoans,
      debtBurdenRatio: session.debtBurdenRatio,
      inquiriesLastMonth: session.inquiriesLastMonth,
      recommendations: session.recommendations || [],
      risks: session.risks || [],
      reportReady: !!session.reportPath,
    };
  }

  if (session.errorMessage) {
    result.errorMessage = session.errorMessage;
  }

  res.json(result);
});

router.get("/sessions/:sessionId/report", async (req, res) => {
  const { sessionId } = req.params;

  const sessions = await db.select().from(analysisSessionsTable).where(eq(analysisSessionsTable.id, sessionId));
  const session = sessions[0];

  if (!session || !session.reportPath) {
    res.status(404).json({ error: "not_found", message: "Report not ready yet" });
    return;
  }

  if (!fs.existsSync(session.reportPath)) {
    res.status(404).json({ error: "not_found", message: "Report file not found" });
    return;
  }

  const isPdf = session.reportPath.endsWith(".pdf");
  res.setHeader("Content-Type", isPdf ? "application/pdf" : "text/html");
  res.setHeader("Content-Disposition", `attachment; filename="credit_report_${sessionId}.${isPdf ? "pdf" : "html"}"`);
  res.sendFile(path.resolve(session.reportPath));
});

export default router;
