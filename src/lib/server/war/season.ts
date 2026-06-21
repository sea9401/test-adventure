// v2 전쟁 주간 시즌 — PvP·낚시·보물과 동일한 ISO 주차 경계(월 00:00 KST = 일 15:00 UTC).
// 별도 시즌 테이블 없이 시각에서 파생한다(보물 시즌과 같은 패턴). 점수 원장
// (war_score_events)이 season_id 로 스코프되고, 주간 롤오버 크론이 "직전 시즌"을 닫는다.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ACTIVE_CONTEST_OUTPOST_IDS } from "@/adventure/data/v2/warOutposts";
import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "@/lib/server/pvp/season";

export function currentWarSeasonId(now: Date = new Date()): string {
  return seasonIdFor(weekStartUtcFor(now));
}

export function warSeasonBounds(now: Date = new Date()): {
  id: string;
  startAt: Date;
  endAt: Date;
} {
  const startAt = weekStartUtcFor(now);
  return { id: seasonIdFor(startAt), startAt, endAt: weekEndUtcFor(startAt) };
}

// 주간 롤오버 시 활성 쟁탈 거점 점령 처리 결정(순수). 경계-인식형 중립화 —
// 시즌 경계(15:00)와 롤오버 크론(15:03) 사이 창에서 정당하게 점령된 "새 시즌 첫 점령"이
// 지난 시즌 잔재와 섞여 삭제되는 것을 막는다.
//   already-neutral: 점령자 없음(이미 중립) → 무동작.
//   keep:            새 시즌 경계 이후 점령 → 유지(증발 방지).
//   neutralize:      경계 이전 점령(지난 시즌 보유자) → 중립화(row 삭제).
export function rolloverDecision(
  occupiedByUserId: string | null | undefined,
  occupiedAt: Date,
  seasonStart: Date,
): "already-neutral" | "keep" | "neutralize" {
  if (occupiedByUserId == null) return "already-neutral";
  return occupiedAt.getTime() >= seasonStart.getTime() ? "keep" : "neutralize";
}

export type WarRolloverSummary = {
  reset: number;
  keptNewSeason: number;
  alreadyNeutral: number;
  errored: number;
};

// 주간 전쟁 시즌 롤오버 실행 — cron(/api/v2/cron/war-season-rollover)과 관리자 수동
// 트리거가 공유. 활성 쟁탈 거점의 점령을 중립으로 리셋(occupation row 삭제). npc-attacks 의
// 방어 실패 중립화와 같은 의미론(행 없음 = NPC 운영)이라 claim/overview 분기와 정합.
//   ⚠️ null-update 가 아니라 row 삭제 — 빈 점령 row 가 claim 의 stillHasOccRow 분기를
//      오작동(NPC 단판 점령 대신 성벽 타격)시키지 않게.
//
// 멱등: 삭제는 두 번 호출해도 두 번째는 0행(alreadyNeutral). 시즌 점수 원장
// (war_score_events)은 건드리지 않는다 — 지난 시즌 점수는 season_id 로 영구 보존돼
// 결산·히스토리에 그대로 쓰인다. 거점 금고(outpost_treasury)도 0으로 만들지 않는다(미점령
// 거점 전쟁 유인 유지). 보호막(protectedUntil)은 row 와 함께 사라져 새 시즌 첫 점령이
// 보호막 없이 가능 — 의도된 개막 동작.
//
// 🔑 경계-인식형 중립화: 시즌 경계(일 15:00 UTC)와 cron(15:03) 사이 3분 창에서 정당하게
//   점령된 "새 시즌 첫 점령"을 지난 시즌 잔재와 섞어 삭제하지 않도록, occupiedAt < 시즌시작
//   인 점령(지난 시즌 보유자)만 중립화한다. cron 분 단위 정시성에 의존하지 않으므로
//   지연·수동 실행에 내성(관리자 버튼으로 아무 때나 눌러도 안전).
export async function runWarSeasonRollover(
  now: Date = new Date(),
): Promise<WarRolloverSummary> {
  // 이번(새) 시즌 시작 시각 — 이 시점 이전 점령만 지난 시즌 잔재로 보고 중립화.
  // 루프 전 1회 계산 → 모든 거점이 동일 기준(거점 간 일관).
  const seasonStart = warSeasonBounds(now).startAt;

  const summary: WarRolloverSummary = {
    reset: 0,
    keptNewSeason: 0,
    alreadyNeutral: 0,
    errored: 0,
  };
  for (const outpostId of ACTIVE_CONTEST_OUTPOST_IDS) {
    try {
      await db.transaction(async (tx) => {
        // claim/npc-attacks 와 같은 occupation FOR UPDATE 선행 — 같은 거점 직렬화.
        const locked = (
          await tx
            .select({
              occupiedByUserId: outpostOccupations.occupiedByUserId,
              occupiedAt: outpostOccupations.occupiedAt,
            })
            .from(outpostOccupations)
            .where(eq(outpostOccupations.outpostId, outpostId))
            .for("update")
            .limit(1)
        )[0];
        const decision = locked
          ? rolloverDecision(
              locked.occupiedByUserId,
              locked.occupiedAt,
              seasonStart,
            )
          : "already-neutral";
        if (decision === "already-neutral") {
          summary.alreadyNeutral += 1;
          return;
        }
        if (decision === "keep") {
          // 새 시즌 경계 이후 점령 = 정당한 신 시즌 첫 점령 → 유지(증발 방지).
          summary.keptNewSeason += 1;
          return;
        }
        // 지난 시즌 보유자 중립화 = row 통째 삭제(null-update 아님). 창 안에 성벽 타격
        // (siege_win)이 들어와 fortHp 가 깎인 상태여도, occupiedAt 은 그대로라 여기서
        // 중립화된다 — 이게 의도된 주간 리셋이다. 삭제라서 깎인 fortHp 가 잔존하지 않고,
        // 다음 점령이 fresh FORT_MAX_HP 로 INSERT 된다.
        await tx
          .delete(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, outpostId));
        summary.reset += 1;
      });
    } catch (e) {
      console.error("[war-season-rollover] outpost error", outpostId, e);
      summary.errored += 1;
    }
  }

  return summary;
}
