import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { ANTIQUES, appraiseValue } from "@/adventure/data/v2/antique";
import {
  TREASURE_SESSION_KEY,
  applyTreasureAction,
  isTreasureAction,
  parseTreasureSession,
  toPublicSite,
  type TreasureActionTarget,
} from "@/adventure/v2/treasureDig";
import {
  TREASURE_COLLECTION_KEY,
  addInstance,
  parseTreasureCollection,
} from "@/adventure/v2/treasureCollection";
import {
  generateAntiqueInstanceId,
  type AntiqueInstance,
} from "@/adventure/v2/antiqueInstances";
import {
  TREASURE_CODEX_KEY,
  countDiscoveredAntiques,
  parseTreasureCodex,
  recordFind,
} from "@/adventure/v2/treasureCodex";
import { addTreasureScore } from "@/lib/server/treasure/records";
import { currentTreasureSeasonId } from "@/lib/server/treasure/season";

// POST /api/v2/treasure/dig — body { siteId, action }. 발굴 행동을 수행한다.
//
// 회수 성공이면 open 때 박제한 골동품을 인스턴스로 발굴해 보관함(treasure-collection.v1)에
// 넣고 유물 도감에 등록하고 세션 종료. 진행 행동은 지도/탐사력/전리품/안정도/위험 상태를 갱신한다.
// 골동품과 기초 보존상태는 세션에만 있어 클라가 위조 못 한다. 락 순서: session → collection → codex.
export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const b = (body ?? {}) as { siteId?: unknown; action?: unknown; target?: unknown };
  if (typeof b.siteId !== "string" || !isTreasureAction(b.action)) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const siteId = b.siteId;
  const action = b.action;
  const target = parseTarget(b.target);
  const now = Date.now();

  const result = await db.transaction(async (tx) => {
    const session = parseTreasureSession(
      await lockSaveForUpdate(tx, userId, TREASURE_SESSION_KEY, {}),
    );
    if (!session) return { outcome: "no_session" as const };
    // 다른 발굴 지점(새 open 이 덮었거나 이미 종료) — 현재 세션 보존하고 거부.
    if (session.siteId !== siteId) return { outcome: "stale" as const };

    const dig = applyTreasureAction(session, action, target);

    if (dig.kind === "invalid") {
      // 예산소진 등 무효 행동 — 소비 없이 현재 상태 반환.
      return { outcome: "invalid" as const, site: toPublicSite(session) };
    }

    if (dig.kind === "extracted") {
      const instance: AntiqueInstance = {
        instanceId: generateAntiqueInstanceId(),
        antiqueId: session.antiqueId,
        condition: dig.condition,
        foundAt: now,
      };
      // 보관함에 인스턴스 추가.
      const collection = parseTreasureCollection(
        await lockSaveForUpdate(tx, userId, TREASURE_COLLECTION_KEY, {}),
      );
      await upsertSave(
        tx,
        userId,
        TREASURE_COLLECTION_KEY,
        addInstance(collection, instance),
      );
      // 유물 도감 등록(종별 발견 + 최고 보존상태).
      const codex = parseTreasureCodex(
        await lockSaveForUpdate(tx, userId, TREASURE_CODEX_KEY, {}),
      );
      const nextCodex = recordFind(codex, session.antiqueId, dig.condition, now);
      await upsertSave(tx, userId, TREASURE_CODEX_KEY, nextCodex);
      // 주간 발굴가치 점수 += 결정적 감정가(주간 랭킹 원천, PR-7). 같은 tx 원자 증가.
      const appraisedValue = appraiseValue(session.antiqueId, dig.condition);
      await addTreasureScore(
        tx,
        userId,
        currentTreasureSeasonId(new Date(now)),
        appraisedValue,
        new Date(now),
      );
      // 세션 종료.
      await upsertSave(tx, userId, TREASURE_SESSION_KEY, {});

      const a = ANTIQUES[session.antiqueId];
      return {
        outcome: "hit" as const,
        antique: {
          instanceId: instance.instanceId,
          antiqueId: a.id,
          name: a.name,
          tier: a.tier,
          condition: dig.condition,
          appraisedValue,
        },
        codexCount: countDiscoveredAntiques(nextCodex),
        site: toPublicSite(dig.session),
      };
    }

    if (dig.kind === "collapsed" || dig.kind === "failed") {
      await upsertSave(tx, userId, TREASURE_SESSION_KEY, {});
      const a = ANTIQUES[session.antiqueId];
      return {
        outcome: "exhausted" as const,
        site: toPublicSite(dig.session),
        message: dig.message,
        missed: { antiqueId: a.id, name: a.name, tier: a.tier },
      };
    }

    // progress — 세션 갱신.
    await upsertSave(tx, userId, TREASURE_SESSION_KEY, dig.session);
    return {
      outcome: "progress" as const,
      message: dig.message,
      site: toPublicSite(dig.session),
    };
  });

  if (result.outcome === "no_session" || result.outcome === "stale") {
    return Response.json({ ok: false, error: result.outcome }, { status: 409 });
  }
  return Response.json({ ok: true, ...result });
}

function parseTarget(raw: unknown): TreasureActionTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const cell = (raw as { cell?: unknown }).cell;
  return typeof cell === "number" && Number.isInteger(cell) ? { cell } : undefined;
}
