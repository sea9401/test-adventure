import { and, count, eq, gt } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { ugcReports } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";
import { resolveUgcSource } from "@/lib/server/ugcSafety";
import {
  isAllowedUgcReportReason,
  isUgcReportSubject,
  isUgcSourceType,
  normalizeUgcSourceId,
} from "@/lib/ugc-safety";
import { sendOpsAlert } from "@/lib/server/opsAlert";

const REPORTS_PER_HOUR = 10;
const REPORT_DETAILS_MAX_LENGTH = 500;

export async function POST(req: Request) {
  const reporterUserId = await ensureUser();
  if (!reporterUserId) return new Response("unauthorized", { status: 401 });

  let body: {
    subjectType?: unknown;
    sourceType?: unknown;
    sourceId?: unknown;
    reason?: unknown;
    details?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!isUgcReportSubject(body.subjectType)) {
    return new Response("invalid subject type", { status: 400 });
  }
  if (!isUgcSourceType(body.sourceType)) {
    return new Response("invalid source type", { status: 400 });
  }
  if (
    body.sourceType === "marketplace_trade" &&
    body.subjectType !== "content"
  ) {
    return new Response("invalid subject type", { status: 400 });
  }
  const sourceId = normalizeUgcSourceId(body.sourceId);
  if (!sourceId) {
    return new Response("invalid source id", { status: 400 });
  }
  if (!isAllowedUgcReportReason(body.sourceType, body.reason)) {
    return new Response("invalid reason", { status: 400 });
  }
  const details =
    typeof body.details === "string" ? body.details.trim() : "";
  if (details.length > REPORT_DETAILS_MAX_LENGTH) {
    return new Response("details too long", { status: 400 });
  }

  const target = await resolveUgcSource(
    reporterUserId,
    body.sourceType,
    sourceId,
  );
  if (!target) return new Response("not found", { status: 404 });
  if (target.targetUserId === reporterUserId) {
    return new Response("cannot report self", { status: 400 });
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ value: count() })
    .from(ugcReports)
    .where(
      and(
        eq(ugcReports.reporterUserId, reporterUserId),
        gt(ugcReports.createdAt, hourAgo),
      ),
    );
  if (Number(recent?.value ?? 0) >= REPORTS_PER_HOUR) {
    return new Response("rate limited", { status: 429 });
  }

  const reporter = await resolveActor(reporterUserId);
  try {
    const [inserted] = await db
      .insert(ugcReports)
      .values({
        reporterUserId,
        reporterName: reporter.name,
        subjectType: body.subjectType,
        sourceType: target.sourceType,
        sourceId: target.sourceId,
        targetUserId: target.targetUserId,
        targetName: target.targetName,
        reason: body.reason,
        details: details || null,
        contentSnapshot: target.contentSnapshot,
        contextSnapshot: target.contextSnapshot,
      })
      .returning({ id: ugcReports.id });
    after(async () => {
      const accounts = [
        { userId: reporterUserId, name: reporter.name },
        { userId: target.targetUserId, name: target.targetName },
        ...(target.relatedAccounts ?? []),
      ].filter(
        (account, index, all) =>
          all.findIndex((candidate) => candidate.userId === account.userId) ===
          index,
      );
      await sendOpsAlert("[ops] 사용자 콘텐츠 신고 접수", {
        alertType: "ugc.report.created",
        reportId: inserted.id,
        sourceType: target.sourceType,
        reason: body.reason,
        userId: reporterUserId,
        counterpartyUserId: target.targetUserId,
        accounts,
      });
    });
    return Response.json({ ok: true, reportId: inserted.id }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return new Response("already reported", { status: 409 });
    }
    throw error;
  }
}
