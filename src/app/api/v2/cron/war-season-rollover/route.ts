import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostOccupations } from "@/db/schema";
import { ACTIVE_CONTEST_OUTPOST_IDS } from "@/adventure/data/v2/warOutposts";
import { rolloverDecision, warSeasonBounds } from "@/lib/server/war/season";

// POST /api/v2/cron/war-season-rollover — 주간 전쟁 시즌 롤오버.
// 일 15:03 UTC = 월 00:03 KST. (npc-attacks 가 매시 정각이라 :03 으로 분 단위 충돌 회피.)
//
// 동작: 활성 쟁탈 거점의 점령을 중립으로 리셋(occupation row 삭제). npc-attacks 의 방어
// 실패 중립화와 같은 의미론(행 없음 = NPC 운영)이라 claim/overview 분기와 정합.
//   ⚠️ null-update 가 아니라 row 삭제 — 빈 점령 row 가 claim 의 stillHasOccRow 분기를
//      오작동(NPC 단판 점령 대신 성벽 타격)시키지 않게.
//
// 멱등: 삭제는 두 번 호출해도 두 번째는 0행(alreadyNeutral). 시즌 점수 원장
// (war_score_events)은 건드리지 않는다 — 지난 시즌 점수는 season_id 로 영구 보존돼
// 결산·히스토리에 그대로 쓰인다. 거점 금고(outpost_treasury)도 0으로 만들지 않는다(미점령
// 거점 전쟁 유인 유지). 보호막(protectedUntil)은 row 와 함께 사라져 새 시즌 첫 점령이
// 보호막 없이 가능 — 의도된 개막 동작.
//
// 🔑 경계-인식형 중립화: 시즌 경계(일 15:00 UTC)와 이 크론(15:03) 사이 3분 창에서 정당하게
//   점령된 "새 시즌 첫 점령"을 지난 시즌 잔재와 섞어 삭제하지 않도록, occupiedAt < 시즌시작
//   인 점령(지난 시즌 보유자)만 중립화한다. 새 시즌 안(occupiedAt >= 시즌시작) 점령은 유지.
//   이로써 cron 분 단위 정시성에 의존하지 않고(지연·수동 실행 내성) 멱등·정합.
//
// 결산 보상은 이 MVP 에 없음(리더보드는 원장 read-time). 보상 지급 크론은 후속.

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 이번(새) 시즌 시작 시각 — 이 시점 이전 점령만 지난 시즌 잔재로 보고 중립화.
  // 루프 전 1회 계산 → 모든 거점이 동일 기준(거점 간 일관). 크론이 경계(15:00) 3분 뒤
  // (15:03) 실행이라 seasonStart 는 "이번 일요일 15:00" 으로 안정 — 실행 중 경계가 다시
  // 넘어가지 않는다(다음 경계는 7일 뒤). 경계 직전 수동 실행이라는 극단 케이스도 전부
  // keep(무동작)으로 self-correct 후 정시 실행이 바로잡으므로 오염 없음.
  const seasonStart = warSeasonBounds(new Date()).startAt;

  const summary = { reset: 0, keptNewSeason: 0, alreadyNeutral: 0, errored: 0 };
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
        // 중립화된다 — 이게 의도된 주간 리셋이다(보유자 영토는 사이그 여부와 무관하게
        // 끊긴다). 삭제라서 깎인 fortHp 가 잔존하지 않고, 다음 점령이 fresh FORT_MAX_HP 로
        // INSERT 된다. (siege 가 occupiedAt 을 터치해 keep 시키면 보유자가 리셋을 우회하므로
        // 의도적으로 그렇게 하지 않는다.)
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

  return Response.json({ ok: true, ...summary });
}
