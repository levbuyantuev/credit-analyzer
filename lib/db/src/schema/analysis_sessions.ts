import { pgTable, text, integer, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analysisSessionsTable = pgTable("analysis_sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("uploading"),
  filesCount: integer("files_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ratingScore: integer("rating_score"),
  ratingLabel: text("rating_label"),
  rating: text("rating"),
  summary: text("summary"),
  totalDebts: real("total_debts"),
  activeLoans: integer("active_loans"),
  closedLoans: integer("closed_loans"),
  overdueLoans: integer("overdue_loans"),
  debtBurdenRatio: real("debt_burden_ratio"),
  inquiriesLastMonth: integer("inquiries_last_month"),
  recommendations: jsonb("recommendations"),
  risks: jsonb("risks"),
  reportPath: text("report_path"),
  errorMessage: text("error_message"),
});

export const insertAnalysisSessionSchema = createInsertSchema(analysisSessionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertAnalysisSession = z.infer<typeof insertAnalysisSessionSchema>;
export type AnalysisSession = typeof analysisSessionsTable.$inferSelect;
