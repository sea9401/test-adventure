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

  it("floor 1~4 (×1.0) 은 동일 객체 반환 (cap/배율 미적용)", () => {
    const weak = MONSTERS["슬라임"];
    expect(scaleMonsterForFloor(weak, 1)).toBe(weak);
    expect(scaleMonsterForFloor(weak, 2)).toBe(weak);
    expect(scaleMonsterForFloor(weak, 3)).toBe(weak);
    expect(scaleMonsterForFloor(weak, 4)).toBe(weak);
  });

  it("floor 5 — 라이브 엔드보스 압축(난이도 ×0.4 + def cap 26), exp 는 분리(base ×1.0)", () => {
    // 잠든 황좌 거인 = 라이브 5막 엔드보스 (hp2070/atk136/def82/exp280).
    const giant = MONSTERS["잠든 황좌 거인"];
    const scaled = scaleMonsterForFloor(giant, 5);
    expect(scaled).not.toBe(giant);
    expect(scaled.hp).toBe(Math.round(2070 * 0.4)); // 828 — 난이도(hp) ×0.4
    expect(scaled.atk).toBe(Math.round(136 * 0.4)); // 54
    expect(scaled.def).toBe(26); // min(round(82×0.4)=33, cap 26)
    // exp 는 난이도 배율과 분리 — base(×1.0). Lv70~100 leveling 페이스 보존(난이도에 안 묶음).
    expect(scaled.exp).toBe(280);
    expect(scaled.spd).toBe(giant.spd); // hp/atk/def/exp 외 필드 보존
    expect(giant.hp).toBe(2070); // 원본 불변 (mutation 가드)
  });

  it("floor 5 변동성 보존 — 배율이라 작은 몹 < 거인 순서 유지", () => {
    const small = scaleMonsterForFloor(MONSTERS["별점술사 잔영"], 5);
    const giant = scaleMonsterForFloor(MONSTERS["잠든 황좌 거인"], 5);
    expect(small.hp).toBeLessThan(giant.hp); // 314 < 828
    expect(small.atk).toBeLessThan(giant.atk); // 28 < 54
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
