import { describe, expect, it } from "vitest";
import {
  peddlerCargoPayload,
  peddlerErrorLabel,
  peddlerMaxLoadable,
  peddlerRemainingLabel,
  peddlerRouteUnlockText,
  peddlerSelectionTotals,
  type PeddlerCargoView,
} from "./peddlerClient";

const cargo: PeddlerCargoView[] = [
  { id: "material:v2_iron_ore", group: "ore", name: "철광석", points: 2, held: 5_000 },
  { id: "farm:milk", group: "ranch", name: "우유", points: 40, held: 20 },
  { id: "fish:catch_legendary", group: "fish", name: "전설의 어획물", points: 400, held: 1 },
];

describe("행상 화면 계산", () => {
  it("고른 짐의 적재 점수와 우대 품목 점수를 더한다", () => {
    expect(
      peddlerSelectionTotals(cargo, { "material:v2_iron_ore": 300, "farm:milk": 10 }, ["farm:milk"]),
    ).toEqual({ points: 1_000, preferredPoints: 400, kinds: 2 });
  });

  it("보유량보다 많이 고른 수량은 보유량으로 친다", () => {
    expect(peddlerSelectionTotals(cargo, { "farm:milk": 99 }, [])).toEqual({ points: 800, preferredPoints: 0, kinds: 1 });
  });

  it("남은 적재량과 보유량 안에서 실을 수 있는 최대 수량", () => {
    expect(peddlerMaxLoadable(cargo[0], cargo, { "farm:milk": 10 }, 2_000)).toBe(800);
    expect(peddlerMaxLoadable(cargo[1], cargo, {}, 2_000)).toBe(20);
    expect(peddlerMaxLoadable(cargo[2], cargo, { "material:v2_iron_ore": 900 }, 2_000)).toBe(0);
    // 이미 고른 자기 수량은 빼고 계산한다.
    expect(peddlerMaxLoadable(cargo[0], cargo, { "material:v2_iron_ore": 1_000 }, 2_000)).toBe(1_000);
  });

  it("보낼 짐에는 고른 품목만 싣는다", () => {
    expect(peddlerCargoPayload(cargo, { "material:v2_iron_ore": 300, "farm:milk": 0 })).toEqual({
      "material:v2_iron_ore": 300,
    });
  });
});

describe("행상 화면 문구", () => {
  it("남은 시간을 시간과 분으로 보여 준다", () => {
    expect(peddlerRemainingLabel(3 * 3_600_000 + 12 * 60_000, 0)).toBe("3시간 12분 남음");
    expect(peddlerRemainingLabel(59_000, 0)).toBe("1분 남음");
    expect(peddlerRemainingLabel(1_000, 1_000)).toBe("");
  });

  it("교역로가 열리는 조건", () => {
    expect(peddlerRouteUnlockText({ kind: "route_rank", routeId: "river", rank: 3 })).toBe(
      "강나루 장터 단골 3등급에 열립니다.",
    );
    expect(peddlerRouteUnlockText({ kind: "total_rank", rank: 10 })).toBe("단골 등급 합계 10에 열립니다.");
  });

  it("모르는 오류는 기본 문구로 보여 준다", () => {
    expect(peddlerErrorLabel("over_capacity")).toBe("적재량을 넘었습니다.");
    expect(peddlerErrorLabel(undefined)).toContain("처리하지 못했습니다");
  });
});
