import { describe, it, expect } from "vitest";
import { MAIN_DUNGEON, enemiesForDepth, depthName } from "./dungeon";
import { scaleMonsterForFloor } from "./monsterScale";
import { floorStatMult, floorDefMult, floorExpMult } from "./dungeonLadder";
import { MONSTERS } from "../monsters";
import { V2_MONSTERS } from "./v2Monsters";
import { V2_ELEMENTS, type V2Element } from "./elements";
import { V2_SKILLS } from "./v2Skills";

describe("v2 dungeon", () => {
  it("statusSkill 은 monsterOnly v2 스킬만, 1구역(신규)엔 없음 (PR-9)", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const e of floor.enemies) {
        if (!e.statusSkill) continue;
        const s = V2_SKILLS[e.statusSkill];
        expect(s, `${e.key} statusSkill ${e.statusSkill} 미존재`).toBeDefined();
        expect(s.monsterOnly, `${e.statusSkill} monsterOnly`).toBe(true);
        // 1구역(Lv1~5)은 상태이상 없음 — 신규 온보딩 보호.
        expect(floor.id, `${e.key} 가 1구역인데 statusSkill`).toBeGreaterThan(1);
      }
    }
  });

  it("모든 enemy key 가 v2 전용 카탈로그(V2_MONSTERS)에 존재", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const enemy of floor.enemies) {
        expect(
          V2_MONSTERS[enemy.key],
          `${floor.name} 의 ${enemy.key} 가 V2_MONSTERS 에 없음`,
        ).toBeDefined();
      }
    }
  });

  it("단일 무한 프론티어 — authored 깊이 1·2(들판·깊은 산)만 MAIN_DUNGEON, 3+ 는 생성", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1, 2]);
    expect(MAIN_DUNGEON.floors[0].name).toBe("들판");
    expect(MAIN_DUNGEON.floors[1].name).toBe("깊은 산");
  });

  it("enemiesForDepth / depthName — 1·2 authored, 3+ 밴드 A~F", () => {
    expect(enemiesForDepth(1)).toBe(MAIN_DUNGEON.floors[0].enemies);
    expect(enemiesForDepth(2)).toBe(MAIN_DUNGEON.floors[1].enemies);
    // 밴드 경계 — 각 밴드는 5종, 인접 밴드와 다른 풀.
    const bandReps = [3, 8, 15, 22, 29, 36]; // A·B·C·D·E·F 대표 깊이
    const bandNames = ["마른 협곡", "얼음 호수", "심층 동굴", "잊힌 성소", "리자드 늪지", "짐승의 소굴"];
    for (let i = 0; i < bandReps.length; i++) {
      const pool = enemiesForDepth(bandReps[i]);
      expect(pool.length, `${bandNames[i]} 5종`).toBe(5);
      expect(depthName(bandReps[i]), `${bandNames[i]} 이름`).toContain(bandNames[i]);
      if (i > 0) {
        expect(pool, `${bandNames[i]} ≠ ${bandNames[i - 1]}`).not.toBe(
          enemiesForDepth(bandReps[i - 1]),
        );
      }
    }
    // 밴드 경계 정확성(상한 inclusive·다음 깊이 전환).
    expect(enemiesForDepth(7)).toBe(enemiesForDepth(3)); // A 상한
    expect(enemiesForDepth(14)).toBe(enemiesForDepth(8)); // B 상한
    expect(enemiesForDepth(35)).toBe(enemiesForDepth(29)); // E 상한
    expect(enemiesForDepth(999)).toBe(enemiesForDepth(36)); // F 무한 반복
    // 전 밴드 키 V2_MONSTERS 존재 + statusSkill 은 monsterOnly v2 스킬.
    for (const d of bandReps) {
      for (const e of enemiesForDepth(d)) {
        expect(V2_MONSTERS[e.key], `${e.key} V2_MONSTERS 부재`).toBeDefined();
        if (e.statusSkill) {
          const s = V2_SKILLS[e.statusSkill];
          expect(s, `${e.statusSkill} 미존재`).toBeDefined();
          expect(s.monsterOnly, `${e.statusSkill} monsterOnly`).toBe(true);
        }
      }
    }
    expect(depthName(1)).toBe("들판");
    expect(depthName(2)).toBe("깊은 산");
    expect(depthName(50)).toContain("50");
  });

  it("전 층 파워 requirement(단조 증가)", () => {
    const floors = MAIN_DUNGEON.floors;
    let prev = 0;
    for (const floor of floors) {
      expect(floor.requirement.kind).toBe("power");
      if (floor.requirement.kind === "power") {
        expect(floor.requirement.min).toBeGreaterThan(prev); // 층이 올라갈수록 권장 파워↑
        prev = floor.requirement.min;
      }
    }
  });

  it("사다리 스탯 배율 단조 비감소 (깊을수록 어려움)", () => {
    for (let i = 1; i < 8; i++) {
      const a = floorStatMult(i as 1 | 2 | 3 | 4 | 5 | 6 | 7);
      const b = floorStatMult((i + 1) as 2 | 3 | 4 | 5 | 6 | 7 | 8);
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });
});

// PR-5 — 속성 분포 게이트. 한 층이 한 속성에 안 쏠리고, 코스믹은 5구역부터.
describe("v2 몬스터 속성 분포 (PR-5 게이트)", () => {
  const elemOf = (e: { element?: V2Element }): V2Element =>
    e.element ?? "neutral";

  it("모든 enemy 속성은 유효한 V2Element", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      for (const enemy of floor.enemies) {
        expect(
          V2_ELEMENTS,
          `${floor.name} ${enemy.key} element=${enemy.element}`,
        ).toContain(elemOf(enemy));
      }
    }
  });

  it("각 층은 ≥2 종류의 non-neutral 속성 (mono-속성 금지 = 게이트)", () => {
    for (const floor of MAIN_DUNGEON.floors) {
      const nonNeutral = new Set(
        floor.enemies.map(elemOf).filter((e) => e !== "neutral"),
      );
      expect(
        nonNeutral.size,
        `${floor.name} 가 속성 ${nonNeutral.size}종 (≥2 필요)`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("코스믹(별빛/공허)은 5구역(설원)부터만 — 1~4구역은 자연 속성만", () => {
    const cosmic = new Set<V2Element>(["starlight", "void"]);
    for (const floor of MAIN_DUNGEON.floors) {
      if (floor.id <= 4) {
        for (const enemy of floor.enemies) {
          expect(
            cosmic.has(elemOf(enemy)),
            `${floor.name} ${enemy.key} 가 1~4구역인데 코스믹`,
          ).toBe(false);
        }
      }
    }
  });

  it("활성 2구역은 코스믹(별빛/공허) 미등장 — 엔드 구역 축소", () => {
    // 코스믹은 엔드 구역(6~8)에만 있었고 축소로 제거. 코스믹 외엔 전부 자연/무속성.
    // (소수 몹 던전이라 자연 전 원소 커버는 비강제 — 한 층 ≥2 non-neutral 게이트는 위 테스트.)
    const used = new Set<V2Element>();
    for (const floor of MAIN_DUNGEON.floors) {
      for (const enemy of floor.enemies) used.add(elemOf(enemy));
    }
    expect(used.has("starlight")).toBe(false);
    expect(used.has("void")).toBe(false);
  });
});

describe("scaleMonsterForFloor", () => {
  const base = MONSTERS["별빛 박쥐"];

  it("floor 1·2 (×1.0) 은 동일 객체 반환", () => {
    const weak = MONSTERS["슬라임"];
    expect(scaleMonsterForFloor(weak, 1)).toBe(weak);
    expect(scaleMonsterForFloor(weak, 2)).toBe(weak);
  });

  it("floor 3+ 사다리 배율 — hp/atk 선형·def 댐핑·exp 곡선, 새 객체", () => {
    const scaled = scaleMonsterForFloor(base, 8);
    expect(scaled).not.toBe(base);
    expect(scaled.hp).toBe(Math.round(base.hp * floorStatMult(8)));
    expect(scaled.atk).toBe(Math.round(base.atk * floorStatMult(8)));
    expect(scaled.def).toBe(Math.round(base.def * floorDefMult(8)));
    expect(scaled.exp).toBe(Math.round(base.exp * floorExpMult(8)));
    expect(scaled.spd).toBe(base.spd); // hp/atk/def/exp 외 필드 보존
    expect(scaled.name).toBe(base.name);
  });

  it("베이스 변형 없음 (mutation 가드)", () => {
    const beforeHp = base.hp;
    scaleMonsterForFloor(base, 8);
    expect(base.hp).toBe(beforeHp);
  });
});
