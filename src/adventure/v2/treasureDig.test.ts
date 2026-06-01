import { describe, it, expect } from "vitest";
import {
  DIGS_ALLOWED,
  GRID_SIZE,
  TOTAL_CELLS,
  applyDig,
  chebyshev,
  clueForDistance,
  parseTreasureSession,
  rollNewSession,
  toPublicSite,
  type TreasureSession,
} from "./treasureDig";
import { isAntiqueId } from "@/adventure/data/v2/antique";

// 매장지를 알고 시작하는 테스트용 세션 빌더(굴림 우회).
function sessionWith(treasureCell: number): TreasureSession {
  return {
    siteId: "s1",
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
    expect(r.session.digs).toEqual([{ cell: 12, clue: "hot" }]);
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
    expect(s.digs.length).toBe(DIGS_ALLOWED);
    expect(lastKind).toBe("exhausted");
    // 예산 소진 후 추가 발굴 → invalid.
    expect(applyDig(s, 10).kind).toBe("invalid");
  });
});

describe("rollNewSession / toPublicSite", () => {
  it("유효 세션 굴림 + 공개 뷰는 비밀 제거", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0.5, now: 1000 });
    expect(s.treasureCell).toBeGreaterThanOrEqual(0);
    expect(s.treasureCell).toBeLessThan(TOTAL_CELLS);
    expect(isAntiqueId(s.antiqueId)).toBe(true);
    expect(s.digsAllowed).toBe(DIGS_ALLOWED);
    const pub = toPublicSite(s);
    expect(pub).not.toHaveProperty("treasureCell");
    expect(pub).not.toHaveProperty("antiqueId");
    expect(pub).not.toHaveProperty("condition");
    expect(pub.digsUsed).toBe(0);
  });

  it("rng 0 → 매장지 0번 셀", () => {
    const s = rollNewSession({ siteId: "x", rng: () => 0, now: 0 });
    expect(s.treasureCell).toBe(0);
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
    expect(ok?.digs).toEqual([{ cell: 0, clue: "warm" }]);
  });
});
