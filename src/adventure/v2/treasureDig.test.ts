import { describe, it, expect } from "vitest";
import {
  DIGS_ALLOWED,
  GRID_SIZE,
  TOTAL_CELLS,
  applyTreasureAppraisalBonus,
  applyDig,
  chebyshev,
  clueForDistance,
  parseTreasureSession,
  rollNewSession,
  treasureActionsUsed,
  treasureAppraisalBonusPct,
  treasureConditionAfterHit,
  toPublicSite,
  type TreasureSession,
} from "./treasureDig";
import { isAntiqueId } from "@/adventure/data/v2/antique";

// 매장지를 알고 시작하는 테스트용 세션 빌더(굴림 우회).
function sessionWith(treasureCell: number): TreasureSession {
  return {
    siteId: "s1",
    siteOptionId: "old_market",
    fieldEventId: null,
    gridSize: GRID_SIZE,
    treasureCell,
    antiqueId: "clay_shard",
    condition: 50,
    digsAllowed: DIGS_ALLOWED,
    digs: [],
    openedAt: 0,
  };
}

describe("chebyshev / clueForDistance", () => {
  it("거리: 5×5 인덱스 기준", () => {
    expect(chebyshev(0, 0, 5)).toBe(0);
    expect(chebyshev(0, 1, 5)).toBe(1); // (0,0)-(0,1)
    expect(chebyshev(0, 6, 5)).toBe(1); // (0,0)-(1,1) 대각
    expect(chebyshev(0, 24, 5)).toBe(4); // (0,0)-(4,4) 모서리
    expect(chebyshev(12, 0, 5)).toBe(2); // 중앙(2,2)-(0,0)
  });

  it("단서 밴드", () => {
    expect(clueForDistance(1)).toBe("hot");
    expect(clueForDistance(2)).toBe("warm");
    expect(clueForDistance(3)).toBe("lukewarm");
    expect(clueForDistance(4)).toBe("cold");
    expect(clueForDistance(9)).toBe("cold");
  });
});

describe("applyDig", () => {
  it("적중 → hit", () => {
    const r = applyDig(sessionWith(12), 12);
    expect(r.kind).toBe("hit");
    expect(r.session.digs).toEqual([
      { cell: 12, clue: "hot", tool: "shovel", actionCost: 1 },
    ]);
  });

  it("빗나감 → miss + 거리 단서", () => {
    const r = applyDig(sessionWith(12), 0); // 거리 2 → warm
    expect(r.kind).toBe("miss");
    if (r.kind === "miss") expect(r.clue).toBe("warm");
  });

  it("범위 밖 / 비정수 / 중복 셀 → invalid (소비 없음)", () => {
    const s = sessionWith(12);
    expect(applyDig(s, -1).kind).toBe("invalid");
    expect(applyDig(s, TOTAL_CELLS).kind).toBe("invalid");
    expect(applyDig(s, 3.5).kind).toBe("invalid");
    const after = applyDig(s, 0).session; // 0 파냄
    expect(applyDig(after, 0).kind).toBe("invalid"); // 같은 셀 재발굴
  });

  it("예산 소진 시 마지막 빗나감은 exhausted", () => {
    let s = sessionWith(24); // 매장지 모서리
    // 매장지(24)·이미 판 셀 피해 DIGS_ALLOWED 번 빗나가게 파기.
    const misses = [0, 1, 2, 3, 5, 6].slice(0, DIGS_ALLOWED);
    let lastKind = "";
    for (let i = 0; i < misses.length; i += 1) {
      const r = applyDig(s, misses[i]);
      s = r.session;
      lastKind = r.kind;
    }
    expect(treasureActionsUsed(s)).toBe(DIGS_ALLOWED);
    expect(lastKind).toBe("exhausted");
    // 예산 소진 후 추가 발굴 → invalid.
    expect(applyDig(s, 10).kind).toBe("invalid");
  });

  it("탐침은 선택 칸과 상하좌우 단서를 공개하지만 적중 발굴은 하지 않는다", () => {
    const probe = applyDig(sessionWith(12), 7, "probe");
    expect(probe.kind).toBe("probe");
    expect(probe.session.digs.map((d) => d.cell)).toEqual([7, 2, 12, 6, 8]);
    expect(treasureActionsUsed(probe.session)).toBe(1);
    expect(probe.session.digs.find((d) => d.cell === 12)).toMatchObject({
      clue: "hot",
      tool: "probe",
      actionCost: 0,
    });

    const hit = applyDig(probe.session, 12, "shovel");
    expect(hit.kind).toBe("hit");
    expect(treasureActionsUsed(hit.session)).toBe(2);
    expect(hit.session.digs.find((d) => d.cell === 12)).toMatchObject({
      tool: "shovel",
      actionCost: 1,
    });
  });
});

describe("rollNewSession / toPublicSite", () => {
  it("유효 세션 굴림 + 공개 뷰는 비밀 제거", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0.5, now: 1000 });
    expect(s.treasureCell).toBeGreaterThanOrEqual(0);
    expect(s.treasureCell).toBeLessThan(TOTAL_CELLS);
    expect(isAntiqueId(s.antiqueId)).toBe(true);
    expect(s.digsAllowed).toBe(DIGS_ALLOWED + 1);
    const pub = toPublicSite(s);
    expect(pub).not.toHaveProperty("treasureCell");
    expect(pub).not.toHaveProperty("antiqueId");
    expect(pub).not.toHaveProperty("condition");
    expect(pub.siteOption.name).toBeTruthy();
    expect(pub.fieldEvent?.name).toBeTruthy();
    expect(pub.digsUsed).toBe(0);
  });

  it("rng 0 → 매장지 0번 셀", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0, now: 0 });
    expect(s.treasureCell).toBe(0);
  });

  it("탐사지 선택은 세션에 박제되고 발굴 횟수 modifier 를 적용한다", () => {
    const s = rollNewSession({
      siteId: "royal",
      siteOptionId: "royal_tomb",
      rng: () => 0.5,
      now: 0,
    });
    expect(s.siteOptionId).toBe("royal_tomb");
    expect(s.digsAllowed).toBe(DIGS_ALLOWED - 1);
    expect(toPublicSite(s).siteOption.id).toBe("royal_tomb");
  });

  it("적은 횟수로 적중하면 남은 발굴 횟수만큼 보존상태 보너스를 준다", () => {
    const hit = applyDig(sessionWith(12), 12);
    expect(hit.kind).toBe("hit");
    expect(treasureConditionAfterHit(hit.session)).toBe(65);
  });

  it("현장 이벤트는 보존상태와 감정가 보너스를 적용한다", () => {
    const intactHit = applyDig(
      { ...sessionWith(12), fieldEventId: "intact_layer" },
      12,
    );
    expect(intactHit.kind).toBe("hit");
    expect(treasureConditionAfterHit(intactHit.session)).toBe(75);

    const cacheHit = applyDig(
      { ...sessionWith(12), fieldEventId: "buried_cache" },
      12,
    );
    expect(cacheHit.kind).toBe("hit");
    expect(treasureAppraisalBonusPct(cacheHit.session)).toBe(15);
    expect(applyTreasureAppraisalBonus(1000, 15)).toBe(1150);
  });

  it("봉인된 방 감정가 보너스는 탐침을 사용한 뒤에만 적용한다", () => {
    const sealed = { ...sessionWith(12), fieldEventId: "sealed_chamber" } as const;
    const directHit = applyDig(sealed, 12, "shovel");
    expect(directHit.kind).toBe("hit");
    expect(treasureAppraisalBonusPct(directHit.session)).toBe(0);

    const probe = applyDig(sealed, 7, "probe");
    const probedHit = applyDig(probe.session, 12, "shovel");
    expect(probedHit.kind).toBe("hit");
    expect(treasureAppraisalBonusPct(probedHit.session)).toBe(25);
  });
});

describe("parseTreasureSession", () => {
  it("손상/빈 입력 → null", () => {
    expect(parseTreasureSession(null)).toBeNull();
    expect(parseTreasureSession({})).toBeNull();
    expect(parseTreasureSession({ siteId: "" })).toBeNull();
  });

  it("정상 라운드트립", () => {
    const s = rollNewSession({ siteId: "rt", rng: () => 0.3, now: 5 });
    const withDig = applyDig(s, 0).session;
    expect(parseTreasureSession(withDig)).toEqual(withDig);
  });

  it("구버전 세션처럼 siteOptionId 가 없어도 기본 탐사지로 복구한다", () => {
    const s = rollNewSession({ siteId: "legacy", rng: () => 0.3, now: 5 });
    const parsed = parseTreasureSession({
      ...s,
      siteOptionId: undefined,
      fieldEventId: undefined,
    });
    expect(parsed?.siteOptionId).toBe("old_market");
    expect(parsed?.fieldEventId).toBeNull();
  });

  it("위조 가드: 범위 밖 매장지 / 미지 골동품 / 중복 dig 셀 / 예산 초과", () => {
    const base = rollNewSession({ siteId: "g", rng: () => 0.3, now: 0 });
    expect(parseTreasureSession({ ...base, treasureCell: 999 })).toBeNull();
    expect(parseTreasureSession({ ...base, antiqueId: "fake" })).toBeNull();
    expect(
      parseTreasureSession({
        ...base,
        digs: [
          { cell: 1, clue: "hot" },
          { cell: 1, clue: "warm" },
        ],
      }),
    ).toBeNull();
    expect(
      parseTreasureSession({ ...base, digsAllowed: 1, digs: [
        { cell: 1, clue: "hot" },
        { cell: 2, clue: "warm" },
      ] }),
    ).toBeNull();
    expect(
      parseTreasureSession({ ...base, digs: [{ cell: 0, clue: "nope" }] }),
    ).toBeNull();
  });

  it("위조 가드: 단서가 매장지 거리와 불일치하면 null", () => {
    // 매장지 12, 셀 11 은 거리 1 → "hot" 이어야 하는데 "cold" 로 위조.
    const s = sessionWith(12);
    expect(
      parseTreasureSession({ ...s, digs: [{ cell: 11, clue: "cold" }] }),
    ).toBeNull();
    // 일치하는 단서는 통과(셀 0 = 거리 2 → warm).
    const ok = parseTreasureSession({ ...s, digs: [{ cell: 0, clue: "warm" }] });
    expect(ok?.digs).toEqual([
      { cell: 0, clue: "warm", tool: "shovel", actionCost: 1 },
    ]);
  });
});
