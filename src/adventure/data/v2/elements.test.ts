import { describe, it, expect } from "vitest";
import {
  V2_ELEMENTS,
  V2_ELEMENT_CYCLE,
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

describe("v2 속성 단일 순환 (PR-5 7-ring)", () => {
  it("순환은 7원소, 전부 유효·non-neutral·중복 없음", () => {
    expect(V2_ELEMENT_CYCLE).toHaveLength(7);
    expect(new Set(V2_ELEMENT_CYCLE).size).toBe(7);
    for (const e of V2_ELEMENT_CYCLE) {
      expect(V2_ELEMENTS).toContain(e);
      expect(e).not.toBe("neutral");
    }
    // V2_ELEMENTS = neutral + 순환 7.
    expect(NON_NEUTRAL.slice().sort()).toEqual(
      V2_ELEMENT_CYCLE.slice().sort(),
    );
  });

  it("순환 인접쌍 — 각 원소가 다음을 카운터(우위), 역방향은 열세", () => {
    for (let i = 0; i < V2_ELEMENT_CYCLE.length; i++) {
      const a = V2_ELEMENT_CYCLE[i];
      const next = V2_ELEMENT_CYCLE[(i + 1) % V2_ELEMENT_CYCLE.length];
      expect(elementMatchup(a, next), `${a}>${next}`).toBe("advantage");
      expect(elementMatchup(next, a), `${next}<${a}`).toBe("disadvantage");
    }
  });

  it("대칭 — 각 원소는 정확히 1개를 이기고 1개에게 진다 (clean RPS)", () => {
    for (const a of NON_NEUTRAL) {
      let wins = 0;
      let losses = 0;
      for (const b of NON_NEUTRAL) {
        if (a === b) continue;
        const m = elementMatchup(a, b);
        if (m === "advantage") wins++;
        else if (m === "disadvantage") losses++;
      }
      expect(wins, `${a} wins`).toBe(1);
      expect(losses, `${a} losses`).toBe(1);
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

  it("배율 — 양방향: 유리 +25% / 불리 −15% / 중립 1 (PvE, 2026-06-20)", () => {
    expect(V2_ELEMENT_ADV_PCT).toBe(25);
    expect(V2_ELEMENT_DIS_PCT).toBe(15);
    // 물>불 유리 = +25%, 반대(불리)는 −15%(양방향 전환 — 옛 0 페널티 폐기).
    expect(elementDamageMult("water", "fire")).toBeCloseTo(1.25);
    expect(elementDamageMult("fire", "water")).toBeCloseTo(0.85);
    // 별빛>공허 동일.
    expect(elementDamageMult("starlight", "void")).toBeCloseTo(1.25);
    expect(elementDamageMult("void", "starlight")).toBeCloseTo(0.85);
    // 무속성은 양방향 모두 ×1(가드 — 골든 byte-identical 근거).
    expect(elementDamageMult("neutral", "fire")).toBe(1);
    expect(elementDamageMult("fire", "neutral")).toBe(1);
  });

  it("PvP 계수(±15) 명시 전달 — 양방향 대칭 유지(메타 불변)", () => {
    expect(V2_ELEMENT_ADV_PCT_PVP).toBe(15);
    expect(V2_ELEMENT_DIS_PCT_PVP).toBe(15);
    const adv = V2_ELEMENT_ADV_PCT_PVP;
    const dis = V2_ELEMENT_DIS_PCT_PVP;
    expect(elementDamageMult("water", "fire", adv, dis)).toBeCloseTo(1.15);
    expect(elementDamageMult("fire", "water", adv, dis)).toBeCloseTo(0.85);
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
