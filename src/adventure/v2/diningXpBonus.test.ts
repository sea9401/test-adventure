import { describe, expect, it } from "vitest";
import {
  addDiningXpBonus,
  diningXpBonusSuffix,
  diningXpBonusText,
  parseDiningXpBonus,
} from "./diningXpBonus";

describe("식당 효과로 붙은 경험치 표시(건의 #882)", () => {
  it("붙은 경험치를 메뉴 이름과 함께 적는다", () => {
    expect(diningXpBonusText({ menuName: "일꾼 도시락", xp: 12 })).toBe("일꾼 도시락 +12");
    expect(diningXpBonusSuffix({ menuName: "길드 대연회", xp: 1234 })).toBe(
      " (길드 대연회 +1,234)",
    );
  });

  it("1 미만이라 이번에 붙은 값이 없으면 모아서 지급된다고 알린다", () => {
    expect(diningXpBonusText({ menuName: "일꾼 도시락", xp: 0 })).toBe(
      "일꾼 도시락 +0, 1 미만은 다음 획득에 합산",
    );
  });

  it("효과가 없으면 아무것도 적지 않는다", () => {
    expect(diningXpBonusText(null)).toBe("");
    expect(diningXpBonusSuffix(null)).toBe("");
    expect(diningXpBonusSuffix(undefined)).toBe("");
  });

  it("응답에서 읽고, 여러 번의 결과를 더한다", () => {
    const first = parseDiningXpBonus({ diningXpBonus: { menuName: "일꾼 도시락", xp: 2 } });
    const second = parseDiningXpBonus({ diningXpBonus: { menuName: "일꾼 도시락", xp: 0 } });
    expect(first).toEqual({ menuName: "일꾼 도시락", xp: 2 });
    expect(addDiningXpBonus(first, second)).toEqual({ menuName: "일꾼 도시락", xp: 2 });
    expect(addDiningXpBonus(null, second)).toEqual({ menuName: "일꾼 도시락", xp: 0 });
    expect(addDiningXpBonus(first, null)).toEqual(first);
    expect(parseDiningXpBonus({})).toBeNull();
    expect(parseDiningXpBonus(null)).toBeNull();
    expect(parseDiningXpBonus({ diningXpBonus: { menuName: "", xp: 3 } })).toBeNull();
  });
});
