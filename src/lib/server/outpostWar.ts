import { eq } from "drizzle-orm";
import { outpostClaimAttempts, outpostOccupations } from "@/db/schema";
import { computeNextAttackAt } from "@/adventure/data/v2/npcAttack";
import { POST_CAPTURE_PROTECT_MS } from "@/adventure/data/v2/outpostSiege";
import type { OutpostTier } from "@/adventure/data/v2/types";
import type {
  ReplayPayload,
  StoredReplayEnvelope,
} from "@/adventure/data/v2/replayPayload";
import type { DbExecutor } from "./savesKv";

// 거점 전쟁 공용 쓰기 — attack(약탈/정복)·claim(공성)·npc-attacks(정기 공격)가
// "claim 미러" 주석에 기대 수동 동기화하던 블록들의 단일 지점(2026-07 통합).
// ⚠️ 락 획득은 여기서 하지 않는다 — 전쟁 tx 의 잠금 순서(occupation→character→treasury→
//    guild_resources 오름차순)는 각 라우트 소관. 여기 함수들은 이미 잠긴 행에 쓰기만 한다.

/** 리플레이 봉투 — payload 없으면 null(기록엔 남기되 전투 보기 버튼 없음). */
export function replayEnvelope(
  payload: ReplayPayload | null,
  playerName: string,
  gender?: string,
): StoredReplayEnvelope | null {
  if (!payload) return null;
  return { payload, playerName, ...(gender ? { gender } : {}) };
}

/** 공격 기록(최근 공격 기록 탭) 1건 — outpost_claim_attempts INSERT 의 단일 지점.
 *  NPC 정기 공격은 attackerUserId=null 로 기록(won = 수비자 승리 여부, npc-attacks 규약). */
export async function recordOutpostAttack(
  tx: DbExecutor,
  rec: {
    outpostId: string;
    attackerUserId: string | null;
    attackerGuildId: number | null;
    defenderName: string;
    defenderUserId: string | null;
    won: boolean;
    turns: number;
    replay: StoredReplayEnvelope | null;
  },
): Promise<void> {
  await tx.insert(outpostClaimAttempts).values(rec);
}

/**
 * 함락 — 소유권 이전 + 정책/세율 리셋 + 성벽 풀충전 + 보호막.
 * attack(정복 인수)과 claim(공성 함락)이 동일 UPDATE 블록을 복붙하던 것 — 필드가
 * 한쪽만 바뀌면 두 함락 경로의 규칙이 갈라지므로 여기가 유일한 정의처다.
 */
export async function captureOutpostOccupation(
  tx: DbExecutor,
  params: {
    outpostId: string;
    newOwnerUserId: string;
    newOwnerGuildId: number | null;
    tier: OutpostTier;
    fortMaxHp: number;
    occupiedAt: Date;
    /** protectedUntil 기준 시각(라우트의 now 스냅샷). */
    nowMs: number;
  },
): Promise<void> {
  await tx
    .update(outpostOccupations)
    .set({
      occupiedByUserId: params.newOwnerUserId,
      occupiedByGuildId: params.newOwnerGuildId,
      occupiedAt: params.occupiedAt,
      policy: "open",
      taxRate: "0.100",
      nextAttackAt: computeNextAttackAt(params.tier, Date.now()),
      fortHp: params.fortMaxHp,
      fortUpdatedAt: params.occupiedAt,
      protectedUntil: new Date(params.nowMs + POST_CAPTURE_PROTECT_MS),
    })
    .where(eq(outpostOccupations.outpostId, params.outpostId));
}
