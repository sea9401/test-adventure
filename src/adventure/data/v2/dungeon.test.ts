import { describe, it, expect } from "vitest";
import { MAIN_DUNGEON, FLOOR_DIFFICULTY } from "./dungeon";
import { scaleMonsterForFloor } from "./monsterScale";
import { MONSTERS } from "../monsters";

describe("v2 dungeon", () => {
  it("모든 enemy 이름이 라이브 MONSTERS 에 존재", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const name of floor.enemies) {
        expect(MONSTERS[name], `${floor.name} 의 ${name} 가 MONSTERS 에 없음`).toBeDefined();
      }
    }
  });

  it("5층 모두 정의됨", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("1~2층은 레벨 requirement, 3~5층은 endgame requirement", () => {
    const [f1, f2, f3, f4, f5] = MAIN_DUNGEON.floors;
    expect(f1.requirement.kind).toBe("level");
    expect(f2.requirement.kind).toBe("level");
    expect(f3.requirement.kind).toBe("endgame");
    expect(f4.requirement.kind).toBe("endgame");
    expect(f5.requirement.kind).toBe("endgame");
  });

  it("3~5층 enemy 풀이 서로 겹치지 않음 (이름 → multiplier 일관)", () => {
    const f3 = new Set(MAIN_DUNGEON.floors[2].enemies);
    const f4 = new Set(MAIN_DUNGEON.floors[3].enemies);
    const f5 = new Set(MAIN_DUNGEON.floors[4].enemies);
    for (const n of f3) expect(f4.has(n), `3·4층 겹침: ${n}`).toBe(false);
    for (const n of f3) expect(f5.has(n), `3·5층 겹침: ${n}`).toBe(false);
    for (const n of f4) expect(f5.has(n), `4·5층 겹침: ${n}`).toBe(false);
  });

  it("FLOOR_DIFFICULTY 가 단조 비감소 (깊을수록 어려움)", () => {
    expect(FLOOR_DIFFICULTY[1]).toBeLessThanOrEqual(FLOOR_DIFFICULTY[2]);
    expect(FLOOR_DIFFICULTY[2]).toBeLessThanOrEqual(FLOOR_DIFFICULTY[3]);
    expect(FLOOR_DIFFICULTY[3]).toBeLessThanOrEqual(FLOOR_DIFFICULTY[4]);
    expect(FLOOR_DIFFICULTY[4]).toBeLessThanOrEqual(FLOOR_DIFFICULTY[5]);
  });
});

describe("scaleMonsterForFloor", () => {
  const base = MONSTERS["별빛 박쥐"];

  it("multiplier 1.0 (1·2층) 은 동일 객체 반환", () => {
    expect(scaleMonsterForFloor(base, 1)).toBe(base);
    expect(scaleMonsterForFloor(base, 2)).toBe(base);
  });

  it("3층 ×1.2 — hp/atk/def/exp 만 곱, 새 객체", () => {
    const scaled = scaleMonsterForFloor(base, 3);
    expect(scaled).not.toBe(base);
    expect(scaled.hp).toBe(Math.round(base.hp * 1.2));
    expect(scaled.atk).toBe(Math.round(base.atk * 1.2));
    expect(scaled.def).toBe(Math.round(base.def * 1.2));
    expect(scaled.exp).toBe(Math.round(base.exp * 1.2));
    expect(scaled.spd).toBe(base.spd);
    expect(scaled.name).toBe(base.name);
  });

  it("5층 ×4.0 — 베이스 변형 없음 (mutation 가드)", () => {
    const beforeHp = base.hp;
    scaleMonsterForFloor(base, 5);
    expect(base.hp).toBe(beforeHp);
  });
});
