// POST /api/hunt/collect — 자동 사냥(타이머형 원정) 수령 (조기 수령 겸용).
//
// body: { playerName?: string, autoPotionRules?: AutoPotionRule[] }
//   - playerName: 전투 로그용 (안 보내면 "모험가")
//   - autoPotionRules: 디바이스별 자동 포션 룰 — sim 에 그대로 전달 (서버에 동기화 안 됨)
//
// 흐름 (3단계 — sim 을 DB tx 밖으로 분리해 single-EC2 의 이벤트 루프/풀 점유 시간을 줄인다):
//   tx1) SELECT users FOR UPDATE → decideClaim 으로 분기.
//        ready 면 baseline 캡처 + state 스냅샷(잠금 없이) 읽어 COMMIT.
//        (replay/noop/clear_baseline 은 여기서 응답 또는 baseline 정리 후 종료.)
//   sim) 트랜잭션 밖에서 assembleSimInput + simulateOfflineHunt + 효율 후처리.
//   tx2) SELECT users FOR UPDATE → decideWinner.
//        winner 면 state 다시 잠금 읽기 + applyResultToSaves(델타) + baseline 해제 + lastClaimResult 박음.
//        loser 면 lastClaimResult 로 replay 또는 noop.
//
// 동시 collect 두 건은 같은 baseline·같은 seed 라 같은 sim 결과가 나오고, tx2 에서 한쪽만 winner
// 가 된다 — 두 번 적용 위험 없음. 새 dispatch 가 사이에 끼면 baseline 시각이 달라 옛 collect 가
// 자동 폐기된다.
//
// 반환: { ok:true, result, hadReward, died, simMs } | { ok:true, noop:true, reason } | { ok:true, replayed:true, ... }

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import {
  applyResultToSaves,
  assembleSimInput,
  decideClaim,
  decideWinner,
  hasMeaningfulResult,
  loadStateForSim,
  makeRng,
  updateBaseline,
  type LoadedState,
} from "@/lib/server/autoHunt";
import {
  AUTO_HUNT_DURATION_MS,
  AUTO_HUNT_EFFICIENCY,
  AUTO_HUNT_MIN_COLLECT_MS,
  applyAutoHuntEfficiency,
} from "@/adventure/battle/autoHunt";
import { simulateOfflineHunt } from "@/adventure/battle/offlineSim";
import type { OfflineSimResult } from "@/adventure/battle/offlineSim";
import type { AutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";
import type { RegionId } from "@/adventure/data/world";
import { ITEMS, isLuckyFind } from "@/adventure/data/items";
import { insertFeedEntry } from "@/lib/server/serverFeed";

type CollectBody = { playerName?: unknown; autoPotionRules?: unknown };

type CollectResponse =
  | { ok: true; noop: true; reason: string }
  | {
      ok: true;
      replayed: true;
      hadReward: boolean;
      result: OfflineSimResult;
      died: boolean;
      simMs: number;
    }
  | {
      ok: true;
      hadReward: boolean;
      result: OfflineSimResult;
      died: boolean;
      simMs: number;
      /** active→ready 로 전환된 의뢰 ID. 클라 quest_ready 토스트. */
      readyQuestIds: string[];
      /** 이번 위탁으로 신규 grant 된 칭호. 클라 milestone 토스트. */
      grantedTitleIds: string[];
    };

type ClaimOutcome =
  | { kind: "early"; response: CollectResponse }
  | {
      kind: "ready";
      state: LoadedState;
      baselineMs: number;
      baselineHp: number;
      baselineRegionId: RegionId;
      simMs: number;
    };

function replayResponse(result: OfflineSimResult): CollectResponse {
  return {
    ok: true,
    replayed: true,
    hadReward: hasMeaningfulResult(result),
    result,
    died: result.died,
    simMs: result.simulatedMs,
  };
}

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(userId, req);
  if (sessionFail) return sessionFail;

  let body: CollectBody = {};
  try {
    body = (await req.json()) as CollectBody;
  } catch {
    // body 없어도 OK.
  }
  const playerName =
    typeof body.playerName === "string" && body.playerName.length > 0
      ? body.playerName
      : "모험가";
  const autoPotionRules: AutoPotionConfig["rules"] = Array.isArray(
    body.autoPotionRules,
  )
    ? (body.autoPotionRules as AutoPotionConfig["rules"])
    : [];

  try {
    // ── tx1: 클레임 결정 + (ready 면) state 스냅샷 캡처. 짧게 끝낸다. ──
    const claim: ClaimOutcome = await db.transaction(async (tx) => {
      const uRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const u = uRows[0] ?? null;
      const snapshot = u
        ? {
            huntActive: u.huntActive,
            huntBaselineAt: u.huntBaselineAt,
            huntBaselineHp: u.huntBaselineHp,
            huntRegion: u.huntRegion,
            lastClaimResult: (u.lastClaimResult as OfflineSimResult | null) ?? null,
          }
        : null;
      const decision = decideClaim(snapshot, Date.now(), AUTO_HUNT_MIN_COLLECT_MS);

      if (decision.kind === "replay") {
        return { kind: "early", response: replayResponse(decision.result) };
      }
      if (decision.kind === "noop") {
        return {
          kind: "early",
          response: { ok: true, noop: true, reason: decision.reason },
        };
      }
      if (decision.kind === "clear_baseline") {
        // 비정상 상태 — region 비어있음. 위탁만 해제하고 noop.
        await updateBaseline(tx, userId, {
          huntActive: false,
          huntRegion: null,
          huntBaselineHp: null,
          huntBaselineAt: null,
          huntPredictedDeathAt: null,
        });
        return {
          kind: "early",
          response: { ok: true, noop: true, reason: decision.reason },
        };
      }

      // ready — state 를 잠금 없이 스냅샷으로 읽는다. 결과 적용은 tx2 에서 다시 잠금 읽기.
      const state = await loadStateForSim(tx, userId, false);
      if (!state) {
        return {
          kind: "early",
          response: { ok: true, noop: true, reason: "no_state" },
        };
      }
      const baselineHp = decision.baselineHp ?? state.character.hp ?? 0;
      const elapsedMs = Date.now() - decision.baselineMs;
      const simMs = Math.min(Math.max(0, elapsedMs), AUTO_HUNT_DURATION_MS);
      return {
        kind: "ready",
        state,
        baselineMs: decision.baselineMs,
        baselineHp,
        baselineRegionId: decision.regionId as RegionId,
        simMs,
      };
    });

    if (claim.kind === "early") {
      return Response.json(claim.response);
    }

    // ── tx 밖: sim 실행. DB 풀/락 점유 없음. ──
    const rng = makeRng(userId, claim.baselineMs);
    const input = assembleSimInput({
      state: claim.state,
      baselineHp: claim.baselineHp,
      baselineRegionId: claim.baselineRegionId,
      awayMs: claim.simMs,
      rng,
      autoPotionRules,
      playerName,
    });
    const raw = simulateOfflineHunt(input);
    const result = applyAutoHuntEfficiency(raw, AUTO_HUNT_EFFICIENCY, rng);

    // ── tx2: winner 검사 + 적용. 다시 짧다. ──
    const response: CollectResponse = await db.transaction(async (tx) => {
      const uRows = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const u = uRows[0] ?? null;
      if (!u) return { ok: true, noop: true, reason: "no_user" };

      const snapshot = {
        huntActive: u.huntActive,
        huntBaselineAt: u.huntBaselineAt,
        huntBaselineHp: u.huntBaselineHp,
        huntRegion: u.huntRegion,
        lastClaimResult: (u.lastClaimResult as OfflineSimResult | null) ?? null,
      };
      const winner = decideWinner(snapshot, claim.baselineMs);
      if (winner.kind === "replay") {
        return replayResponse(winner.result);
      }
      if (winner.kind === "lost") {
        // 같은 baseline 이 아니고 lastClaimResult 도 없음 (이론상 드물다 — 새 dispatch 가 끼어든 경우).
        return { ok: true, noop: true, reason: "stale_claim" };
      }

      // winner — state 잠금 다시 읽고 델타 적용.
      const state2 = await loadStateForSim(tx, userId);
      if (!state2) return { ok: true, noop: true, reason: "no_state" };

      const outcome = await applyResultToSaves(tx, userId, {
        state: state2,
        result,
        died: result.died,
        baselineHp: claim.baselineHp,
      });

      await updateBaseline(tx, userId, {
        huntActive: false,
        huntRegion: null,
        huntBaselineHp: null,
        huntBaselineAt: null,
        huntPredictedDeathAt: null,
        lastClaimId: "collected",
        lastClaimResult: result,
      });

      return {
        ok: true,
        hadReward: hasMeaningfulResult(result),
        result,
        died: result.died,
        simMs: claim.simMs,
        readyQuestIds: outcome.readyQuestIds,
        grantedTitleIds: outcome.grantedTitleIds,
      };
    });

    // 위탁 사냥에서 "유실된 명품"(unique)이 나왔으면 전체 소식에 보고.
    // 조기수령 replay / noop 경로는 제외 — 새로 정산된 결과에서만.
    if (!("noop" in response) && !("replayed" in response)) {
      for (const e of response.result.equipsGained) {
        if (isLuckyFind(ITEMS[e.itemId])) {
          await insertFeedEntry(userId, "unique_drop", { itemId: e.itemId });
        }
      }
    }
    return Response.json(response);
  } catch (e) {
    console.error("[hunt.collect]", e);
    return new Response("internal error", { status: 500 });
  }
}
