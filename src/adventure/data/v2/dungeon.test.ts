import { describe, it, expect } from "vitest";
import { MAIN_DUNGEON, FLOOR_DIFFICULTY } from "./dungeon";
import { scaleMonsterForFloor } from "./monsterScale";
import { MONSTERS } from "../monsters";

describe("v2 dungeon", () => {
  it("모든 enemy 이름이 라이브 MONSTERS 에 존재", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const enemy of floor.enemies) {
        expect(
          MONSTERS[enemy.key],
          `${floor.name} 의 ${enemy.key} 가 MONSTERS 에 없음`,
        ).toBeDefined();
      }
    }
  });

  it("8층 모두 정의됨", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("1~5층은 레벨 requirement, 6~8층은 endgame requirement", () => {
    const floors = MAIN_DUNGEON.floors;
    for (let i = 0; i < 5; i++) {
      expect(floors[i].requirement.kind).toBe("level");
    }
    for (let i = 5; i < 8; i++) {
      expect(floors[i].requirement.kind).toBe("endgame");
    }
  });

  it("6~8구역 enemy 풀(스탯 출처)이 서로 겹치지 않음 (출처 → multiplier 일관)", () => {
    const f6 = new Set(MAIN_DUNGEON.floors[5].enemies.map((e) => e.key));
    const f7 = new Set(MAIN_DUNGEON.floors[6].enemies.map((e) => e.key));
    const f8 = new Set(MAIN_DUNGEON.floors[7].enemies.map((e) => e.key));
    for (const n of f6) expect(f7.has(n), `6·7 겹침: ${n}`).toBe(false);
    for (const n of f6) expect(f8.has(n), `6·8 겹침: ${n}`).toBe(false);
    for (const n of f7) expect(f8.has(n), `7·8 겹침: ${n}`).toBe(false);
  });

  it("FLOOR_DIFFICULTY 가 단조 비감소 (깊을수록 어려움)", () => {
    for (let i = 1; i < 8; i++) {
      const a = FLOOR_DIFFICULTY[i as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      const b = FLOOR_DIFFICULTY[(i + 1) as 2 | 3 | 4 | 5 | 6 | 7 | 8];
      expect(a).toBeLessThanOrEqual(b);
    }
  });
});

describe("scaleMonsterForFloor", () => {
  const base = MONSTERS["별빛 박쥐"];

  it("multiplier 1.0 (1~5층 성장) 은 동일 객체 반환", () => {
    expect(scaleMonsterForFloor(base, 1)).toBe(base);
    expect(scaleMonsterForFloor(base, 2)).toBe(base);
    expect(scaleMonsterForFloor(base, 3)).toBe(base);
    expect(scaleMonsterForFloor(base, 4)).toBe(base);
    expect(scaleMonsterForFloor(base, 5)).toBe(base);
  });

  it("6층 ×1.2 — hp/atk/def/exp 만 곱, 새 객체", () => {
    const scaled = scaleMonsterForFloor(base, 6);
    expect(scaled).not.toBe(base);
    expect(scaled.hp).toBe(Math.round(base.hp * 1.2));
    expect(scaled.atk).toBe(Math.round(base.atk * 1.2));
    expect(scaled.def).toBe(Math.round(base.def * 1.2));
    expect(scaled.exp).toBe(Math.round(base.exp * 1.2));
    expect(scaled.spd).toBe(base.spd);
    expect(scaled.name).toBe(base.name);
  });

  it("8층 ×4.0 — 베이스 변형 없음 (mutation 가드)", () => {
    const beforeHp = base.hp;
    scaleMonsterForFloor(base, 8);
    expect(base.hp).toBe(beforeHp);
  });
});
