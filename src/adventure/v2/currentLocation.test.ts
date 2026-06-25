import { describe, it, expect } from "vitest";
import { currentLocationLabel, standingTileLocation } from "./currentLocation";
import { tileSettlementName } from "@/adventure/data/v2/tileConfig";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";

// 리베라(보드 고정 거점)는 (4,4) — TILE_OUTPOSTS.
const RIVERA_NAME = OUTPOST_BY_ID.get("neutral_haven_central")?.name ?? "리베라";

describe("currentLocationLabel — 좌상단 위치 라벨(서 있는 타일 기준)", () => {
  it("tilePos 없음(보드 밖) → currentOutpost 폴백", () => {
    expect(
      currentLocationLabel({
        tilePos: null,
        tileSettlements: [],
        currentOutpostName: "리베라",
      }),
    ).toBe("리베라");
  });

  it("거점 칸(리베라 4,4) → 거점명", () => {
    expect(
      currentLocationLabel({
        tilePos: { col: 4, row: 4 },
        tileSettlements: [],
        currentOutpostName: "엉뚱한값",
      }),
    ).toBe(RIVERA_NAME);
  });

  it("내가 선 칸의 개척 정착지 → 마을명", () => {
    expect(
      currentLocationLabel({
        tilePos: { col: 2, row: 6 },
        tileSettlements: [
          { col: 2, row: 6, name: "노원역" },
          { col: 0, row: 0, name: "딴마을" },
        ],
        currentOutpostName: "리베라",
      }),
    ).toBe("노원역");
  });

  it("정착지 이름이 비면 좌표 결정 이름으로 폴백", () => {
    expect(
      currentLocationLabel({
        tilePos: { col: 3, row: 1 },
        tileSettlements: [{ col: 3, row: 1, name: "  " }],
        currentOutpostName: "리베라",
      }),
    ).toBe(tileSettlementName(3, 1));
  });

  it("빈 땅(정착지·거점 아님) → 좌표 표기", () => {
    expect(
      currentLocationLabel({
        tilePos: { col: 0, row: 8 },
        tileSettlements: [{ col: 2, row: 6, name: "노원역" }],
        currentOutpostName: "리베라",
      }),
    ).toBe("빈 땅 (0, 8)");
  });

  it("리베라 고정 — 빈 타일로 이동해도 currentOutpostName(리베라)에 묶이지 않음", () => {
    // 회귀 가드: 빈 칸이면 currentOutpostName 을 무시하고 좌표를 보여줘야 한다.
    const label = currentLocationLabel({
      tilePos: { col: 1, row: 3 },
      tileSettlements: [],
      currentOutpostName: "리베라",
    });
    expect(label).not.toBe("리베라");
    expect(label).toBe("빈 땅 (1, 3)");
  });
});

describe("standingTileLocation — 모험 탭 현 위치 카드 분류", () => {
  it("tilePos 없음 → offboard(거점 요약 폴백)", () => {
    expect(
      standingTileLocation({ tilePos: null, tileSettlements: [] }),
    ).toEqual({ kind: "offboard" });
  });

  it("거점 칸(리베라 4,4) → outpost", () => {
    expect(
      standingTileLocation({ tilePos: { col: 4, row: 4 }, tileSettlements: [] }),
    ).toEqual({ kind: "outpost", outpostId: "neutral_haven_central" });
  });

  it("개척 정착지 칸 → settlement(객체 그대로 실어줌)", () => {
    const s = { col: 2, row: 6, name: "노원역", tier: "village" };
    expect(
      standingTileLocation({
        tilePos: { col: 2, row: 6 },
        tileSettlements: [s, { col: 0, row: 0, name: "딴마을", tier: "frontier" }],
      }),
    ).toEqual({ kind: "settlement", settlement: s });
  });

  it("빈 땅(3,4) → empty (리베라 박힘 버그 회귀 가드)", () => {
    // 유저 리포트: 빈 땅 (3,4) 에서 카드가 리베라로 떴다 → empty 로 분류돼야 한다.
    expect(
      standingTileLocation({
        tilePos: { col: 3, row: 4 },
        tileSettlements: [{ col: 2, row: 6, name: "노원역", tier: "village" }],
      }),
    ).toEqual({ kind: "empty", col: 3, row: 4 });
  });
});
