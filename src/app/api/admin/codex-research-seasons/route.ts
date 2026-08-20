import {
  codexResearchConfirmation,
  previewCodexResearchDefinition,
} from "@/adventure/data/v2/codexResearchOps";
import { db } from "@/db";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  CodexResearchOpsError,
  previewCodexResearchSettlementForOps,
  resettleCodexResearchSeason,
  scheduleCodexResearchSeasonForOps,
} from "@/lib/server/codexResearchOps";
import { readCodexResearchSeasonOpsList } from "@/lib/server/codexResearchOpsRepository";
import { settleCodexResearchSeason } from "@/lib/server/codexResearchSettlement";
import { awardCodexResearchSeasonTrophies } from "@/lib/server/codexResearchTrophies";
import { publishCodexResearchSeasonHonors } from "@/lib/server/codexResearchPublication";
import {
  currentAdminEmail,
  getAdminEmailsList,
  requireAdmin,
  requireAdminRole,
} from "@/lib/server/isAdmin";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";

const OPS = [
  "validate",
  "schedule",
  "preview-settlement",
  "settle",
  "resettle",
  "award-trophies",
  "publish-honors",
] as const;
type CodexResearchAdminOp = (typeof OPS)[number];

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOp(value: unknown): value is CodexResearchAdminOp {
  return typeof value === "string" &&
    (OPS as readonly string[]).includes(value);
}

function own(body: JsonObject, key: string): boolean {
  return Object.hasOwn(body, key);
}

async function audit(
  adminEmail: string,
  op: CodexResearchAdminOp | "invalid",
  detail: Record<string, unknown>,
): Promise<void> {
  await logAdminAction({
    adminEmail,
    action: `codex-research.${op}`,
    detail,
  });
}

async function fail(
  adminEmail: string,
  op: CodexResearchAdminOp | "invalid",
  input: {
    error: string;
    status: number;
    message: string;
    seasonId?: string;
  },
): Promise<Response> {
  await audit(adminEmail, op, {
    status: "failed",
    ...(input.seasonId ? { seasonId: input.seasonId } : {}),
    error: input.error,
  });
  return Response.json(
    { ok: false, error: input.error, message: input.message },
    { status: input.status },
  );
}

function bodySeasonId(body: JsonObject): string | null {
  return own(body, "seasonId") && typeof body.seasonId === "string"
    ? body.seasonId
    : null;
}

function definitionSeasonId(body: JsonObject): string | null {
  if (!own(body, "definition") || !isObject(body.definition)) return null;
  return own(body.definition, "seasonId") &&
      typeof body.definition.seasonId === "string"
    ? body.definition.seasonId
    : null;
}

function expectedConfirmation(
  op: "schedule" | "settle" | "resettle" | "award-trophies" | "publish-honors",
  seasonId: string,
): string | null {
  try {
    return codexResearchConfirmation(op, seasonId);
  } catch {
    return null;
  }
}

function successDetail(
  seasonId: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  const detail: Record<string, unknown> = { status: "success", seasonId };
  for (const key of [
    "participantCount",
    "tierCounts",
    "eligibleCount",
    "createdCount",
    "existingCount",
    "notificationCreatedCount",
    "notificationExistingCount",
    "feedCreatedCount",
    "feedExistingCount",
  ]) {
    if (Object.hasOwn(result, key)) detail[key] = result[key];
  }
  return detail;
}

function normalizeOperationError(error: unknown): CodexResearchOpsError | null {
  if (error instanceof CodexResearchOpsError) return error;
  if (!(error instanceof Error)) return null;
  if (error.message === "codex research season does not exist") {
    return new CodexResearchOpsError(
      "season_not_found",
      404,
      "도감 연구 시즌을 찾을 수 없습니다.",
    );
  }
  if (
    error.message === "codex research season has not ended" ||
    error.message === "codex research season cannot be settled" ||
    error.message === "codex research season is not closed"
  ) {
    return new CodexResearchOpsError(
      "season_not_ready",
      409,
      "현재 상태에서는 이 시즌 작업을 실행할 수 없습니다.",
    );
  }
  return null;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;

  const now = new Date();
  const [seasons, features] = await Promise.all([
    readCodexResearchSeasonOpsList(db, now, 24),
    readCodexMasteryFeatureSettings(db),
  ]);
  return Response.json({
    ok: true,
    seasons,
    features: {
      settlementEnabled: features.settlementEnabled,
      trophiesEnabled: features.trophiesEnabled,
      feedEnabled: features.feedEnabled,
    },
  });
}

export async function POST(req: Request) {
  const gate = await requireAdminRole("super");
  if (gate) return gate;

  const adminEmail = await currentAdminEmail();
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail(adminEmail, "invalid", {
      error: "invalid_json",
      status: 400,
      message: "JSON 요청 본문이 올바르지 않습니다.",
    });
  }
  if (!isObject(rawBody)) {
    return fail(adminEmail, "invalid", {
      error: "unknown_op",
      status: 400,
      message: "지원하지 않는 도감 연구 운영 작업입니다.",
    });
  }
  const body = rawBody;
  const rawOp = own(body, "op") ? body.op : null;
  if (!isOp(rawOp)) {
    return fail(adminEmail, "invalid", {
      error: "unknown_op",
      status: 400,
      message: "지원하지 않는 도감 연구 운영 작업입니다.",
    });
  }
  const op: CodexResearchAdminOp = rawOp;
  const now = new Date();
  const seasonId = op === "validate" || op === "schedule"
    ? definitionSeasonId(body)
    : bodySeasonId(body);

  if (op !== "validate" && !seasonId) {
    return fail(adminEmail, op, {
      error: "invalid_request",
      status: 400,
      message: "시즌 ID가 올바르지 않습니다.",
    });
  }
  if (
    op !== "validate" &&
    seasonId &&
    !expectedConfirmation("settle", seasonId)
  ) {
    return fail(adminEmail, op, {
      error: "invalid_request",
      status: 400,
      message: "시즌 ID는 YYYY-MM 형식의 KST 월이어야 합니다.",
      seasonId,
    });
  }
  if (op === "validate" && !own(body, "definition")) {
    return fail(adminEmail, op, {
      error: "invalid_request",
      status: 400,
      message: "검증할 시즌 정의가 없습니다.",
    });
  }

  if (
    op === "schedule" || op === "settle" ||
    op === "resettle" || op === "award-trophies"
    || op === "publish-honors"
  ) {
    const expected = seasonId ? expectedConfirmation(op, seasonId) : null;
    if (
      !expected ||
      !own(body, "confirm") ||
      body.confirm !== expected
    ) {
      return fail(adminEmail, op, {
        error: "confirm_mismatch",
        status: 400,
        message: "확인 문자열이 일치하지 않습니다.",
        ...(seasonId ? { seasonId } : {}),
      });
    }
  }

  try {
    switch (op) {
      case "validate": {
        let preview;
        try {
          preview = previewCodexResearchDefinition(body.definition, now);
        } catch (error) {
          throw new CodexResearchOpsError(
            "invalid_definition",
            400,
            error instanceof Error
              ? error.message
              : "도감 연구 정의가 올바르지 않습니다.",
          );
        }
        await audit(adminEmail, op, {
          status: "success",
          seasonId: preview.seasonId,
          objectiveCount: preview.objectiveCount,
        });
        return Response.json({ ok: true, op, preview });
      }
      case "schedule": {
        const scheduled = await db.transaction((tx) =>
          scheduleCodexResearchSeasonForOps(tx, {
            definition: body.definition,
            now,
          })
        );
        await audit(adminEmail, op, {
          status: "success",
          seasonId: scheduled.seasonId,
        });
        return Response.json({ ok: true, op, season: scheduled });
      }
      case "preview-settlement": {
        const preview = await previewCodexResearchSettlementForOps(db, {
          seasonId: seasonId!,
          adminEmails: getAdminEmailsList(),
          now,
        });
        await audit(adminEmail, op, successDetail(seasonId!, preview));
        return Response.json({ ok: true, op, preview });
      }
      case "settle": {
        const features = await readCodexMasteryFeatureSettings(db);
        if (!features.settlementEnabled) {
          return fail(adminEmail, op, {
            error: "feature_disabled",
            status: 409,
            message: "도감 연구 결산 기능이 꺼져 있습니다.",
            seasonId: seasonId!,
          });
        }
        const result = await db.transaction((tx) =>
          settleCodexResearchSeason(tx, {
            seasonId: seasonId!,
            adminEmails: getAdminEmailsList(),
            now,
          })
        );
        await audit(adminEmail, op, successDetail(seasonId!, result));
        return Response.json({ ok: true, op, result });
      }
      case "resettle": {
        const features = await readCodexMasteryFeatureSettings(db);
        if (!features.settlementEnabled) {
          return fail(adminEmail, op, {
            error: "feature_disabled",
            status: 409,
            message: "도감 연구 결산 기능이 꺼져 있습니다.",
            seasonId: seasonId!,
          });
        }
        const result = await db.transaction((tx) =>
          resettleCodexResearchSeason(tx, {
            seasonId: seasonId!,
            adminEmails: getAdminEmailsList(),
            now,
          })
        );
        await audit(adminEmail, op, successDetail(seasonId!, result));
        return Response.json({ ok: true, op, result });
      }
      case "award-trophies": {
        const features = await readCodexMasteryFeatureSettings(db);
        if (!features.settlementEnabled || !features.trophiesEnabled) {
          return fail(adminEmail, op, {
            error: "feature_disabled",
            status: 409,
            message: "도감 연구 결산 또는 트로피 기능이 꺼져 있습니다.",
            seasonId: seasonId!,
          });
        }
        const result = await db.transaction((tx) =>
          awardCodexResearchSeasonTrophies(tx, seasonId!)
        );
        await audit(adminEmail, op, successDetail(seasonId!, result));
        return Response.json({ ok: true, op, result });
      }
      case "publish-honors": {
        const features = await readCodexMasteryFeatureSettings(db);
        if (!features.settlementEnabled || !features.trophiesEnabled) {
          return fail(adminEmail, op, {
            error: "feature_disabled",
            status: 409,
            message: "도감 연구 결산 또는 트로피 기능이 꺼져 있습니다.",
            seasonId: seasonId!,
          });
        }
        const result = await db.transaction((tx) =>
          publishCodexResearchSeasonHonors(tx, {
            seasonId: seasonId!,
            now,
            feedEnabled: features.feedEnabled,
          })
        );
        await audit(adminEmail, op, successDetail(seasonId!, result));
        return Response.json({ ok: true, op, result });
      }
    }
  } catch (error) {
    const operationError = normalizeOperationError(error);
    console.error("[admin/codex-research-seasons] operation failed", {
      op,
      seasonId,
    });
    return fail(adminEmail, op, {
      error: operationError?.code ?? "operation_failed",
      status: operationError?.status ?? 500,
      message: operationError?.message ?? "도감 연구 운영 작업을 완료하지 못했습니다.",
      ...(seasonId ? { seasonId } : {}),
    });
  }
}
