import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import { runWarSeasonRollover } from "@/lib/server/war/season";
import {
  closeExpiredSeasons,
  getOrCreateCurrentSeason,
} from "@/lib/server/pvp/season";
import { grantPendingSeasonRewards } from "@/lib/server/pvp/seasonRewards";
import { grantPendingFishingRewards } from "@/lib/server/fishing/seasonRewards";
import { grantPendingTreasureRewards } from "@/lib/server/treasure/seasonRewards";

// POST /api/admin/season-ops — 관리자 시즌 수동 트리거.
//
// cron 스케줄(주 1회)을 기다리지 않고 시즌 롤오버/보상 지급을 즉시 실행하는 긴급 운영 도구.
// 모든 op 는 cron 과 동일한 헬퍼를 호출하며 멱등(중복 클릭/cron 과 겹쳐도 두 번 지급 안 됨).
//   - war-rollover     : 활성 쟁탈 거점 점령 중립화 (runWarSeasonRollover)
//   - pvp-rollover     : 만료 아레나 시즌 닫기 + 이번 주 시즌 생성
//   - pvp-rewards      : 닫힌 아레나 시즌 미지급 보상 지급
//   - fishing-rewards  : 끝난 낚시 시즌 미지급 보상 지급
//   - treasure-rewards : 끝난 보물 시즌 미지급 보상 지급
//
// cron 라우트(Bearer CRON_SECRET)와 달리 requireAdmin(ADMIN_EMAILS) 게이트.

const OPS = [
  "war-rollover",
  "pvp-rollover",
  "pvp-rewards",
  "fishing-rewards",
  "treasure-rewards",
] as const;
type SeasonOp = (typeof OPS)[number];

function isSeasonOp(v: unknown): v is SeasonOp {
  return typeof v === "string" && (OPS as readonly string[]).includes(v);
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const op = (body as { op?: unknown } | null)?.op;
  if (!isSeasonOp(op)) {
    return Response.json(
      { ok: false, error: "unknown op", allowed: OPS },
      { status: 400 },
    );
  }

  const now = new Date();
  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: `season-ops.${op}`,
  });

  try {
    switch (op) {
      case "war-rollover": {
        const summary = await runWarSeasonRollover(now);
        return Response.json({ ok: true, op, summary });
      }
      case "pvp-rollover": {
        const closed = await closeExpiredSeasons(now);
        const current = await getOrCreateCurrentSeason(now);
        return Response.json({
          ok: true,
          op,
          summary: { closed, currentSeasonId: current.id },
        });
      }
      case "pvp-rewards": {
        const { closed, results } = await grantPendingSeasonRewards(now);
        return Response.json({
          ok: true,
          op,
          summary: {
            closed,
            seasonsProcessed: results.length,
            granted: results.filter((r) => r.kind === "ok").length,
          },
        });
      }
      case "fishing-rewards": {
        const { results } = await grantPendingFishingRewards(now);
        return Response.json({
          ok: true,
          op,
          summary: {
            seasonsProcessed: results.length,
            granted: results.filter((r) => r.kind === "ok").length,
          },
        });
      }
      case "treasure-rewards": {
        const { results } = await grantPendingTreasureRewards(now);
        return Response.json({
          ok: true,
          op,
          summary: {
            seasonsProcessed: results.length,
            granted: results.filter((r) => r.kind === "ok").length,
          },
        });
      }
    }
  } catch (e) {
    console.error("[admin/season-ops] error", op, e);
    return Response.json(
      { ok: false, op, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
