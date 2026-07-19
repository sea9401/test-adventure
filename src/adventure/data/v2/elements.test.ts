import { describe, it, expect } from "vitest";
import {
  V2_ELEMENTS,
  V2_ELEMENT_ADV_PCT,
  V2_ELEMENT_DIS_PCT,
  V2_ELEMENT_ADV_PCT_PVP,
  V2_ELEMENT_DIS_PCT_PVP,
  elementMatchup,
  elementDamageMult,
  parseV2Element,
  type V2Element,
} from "./elements";

const NON_NEUTRAL = V2_ELEMENTS.filter((e) => e !== "neutral");

describe("v2 속성 메타데이터 (상성 폐지)", () => {
  it("어떤 원소도 다른 원소를 이기거나 지지 않는다", () => {
    for (const a of NON_NEUTRAL) {
      let wins = 0;
      let losses = 0;
      for (const b of NON_NEUTRAL) {
        if (a === b) continue;
        const m = elementMatchup(a, b);
        if (m === "advantage") wins++;
        else if (m === "disadvantage") losses++;
      }
      expect(wins, `${a} wins`).toBe(0);
      expect(losses, `${a} losses`).toBe(0);
    }
  });

  it("같은 원소끼리는 중립", () => {
    for (const a of NON_NEUTRAL) {
      expect(elementMatchup(a, a)).toBe("neutral");
    }
  });

  it("무속성은 어느 쪽이든 중립 (배율 1)", () => {
    for (const a of V2_ELEMENTS) {
      expect(elementMatchup("neutral", a)).toBe("neutral");
      expect(elementMatchup(a, "neutral")).toBe("neutral");
      expect(elementDamageMult("neutral", a)).toBe(1);
      expect(elementDamageMult(a, "neutral")).toBe(1);
    }
  });

  it("PvE 원소 조합은 모두 배율 1", () => {
    expect(V2_ELEMENT_ADV_PCT).toBe(0);
    expect(V2_ELEMENT_DIS_PCT).toBe(0);
    expect(elementDamageMult("water", "fire")).toBe(1);
    expect(elementDamageMult("fire", "water")).toBe(1);
    expect(elementDamageMult("starlight", "void")).toBe(1);
    expect(elementDamageMult("void", "starlight")).toBe(1);
    expect(elementDamageMult("neutral", "fire")).toBe(1);
    expect(elementDamageMult("fire", "neutral")).toBe(1);
  });

  it("PvP도 속성 배율 없이 동일 피해", () => {
    expect(V2_ELEMENT_ADV_PCT_PVP).toBe(0);
    expect(V2_ELEMENT_DIS_PCT_PVP).toBe(0);
    const adv = V2_ELEMENT_ADV_PCT_PVP;
    const dis = V2_ELEMENT_DIS_PCT_PVP;
    expect(elementDamageMult("water", "fire", adv, dis)).toBe(1);
    expect(elementDamageMult("fire", "water", adv, dis)).toBe(1);
  });

  it("빛/어둠 폐지 — V2_ELEMENTS 에 없음, 별빛/공허 로 대체", () => {
    expect(V2_ELEMENTS as readonly string[]).not.toContain("light");
    expect(V2_ELEMENTS as readonly string[]).not.toContain("dark");
    expect(V2_ELEMENTS).toContain("starlight");
    expect(V2_ELEMENTS).toContain("void");
  });

  it("parseV2Element — 유효값 통과, 옛 light/dark·쓰레기는 neutral 폴백", () => {
    for (const e of V2_ELEMENTS) {
      expect(parseV2Element(e)).toBe(e);
    }
    expect(parseV2Element("light")).toBe("neutral"); // 옛 저장값 graceful
    expect(parseV2Element("dark")).toBe("neutral");
    expect(parseV2Element("nonsense")).toBe("neutral");
    expect(parseV2Element(undefined)).toBe("neutral");
    expect(parseV2Element(42)).toBe("neutral");
  });
});

// 타입 가드 — V2Element 사용 (lint no-unused).
const _assertType: V2Element = "starlight";
void _assertType;
