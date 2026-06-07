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

  it("MAIN_DUNGEON.floors = 들판·깊은 산 onboarding 풀(코덱스/dev용, 2종)", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1, 2]);
    expect(MAIN_DUNGEON.floors[0].name).toBe("들판");
    expect(MAIN_DUNGEON.floors[1].name).toBe("깊은 산");
  });

  it("enemiesForDepth / depthName — 테마당 6깊이, 테마 내 로컬 번호 표시", () => {
    // 들판(1~6)·깊은산(7~12)·마른협곡(13~18)·얼음호수(19~24)·심층동굴(25~30)·
    // 잊힌성소(31~36)·리자드늪지(37~42)·짐승의소굴(43~48, 49+ 무한).
    expect(depthName(1)).toBe("들판 1");
    expect(depthName(6)).toBe("들판 6");
    expect(depthName(7)).toBe("깊은 산 1");
    expect(depthName(12)).toBe("깊은 산 6");
    expect(depthName(13)).toBe("마른 협곡 1");
    expect(depthName(43)).toBe("짐승의 소굴 1");
    expect(depthName(48)).toBe("짐승의 소굴 6");
    expect(depthName(50)).toBe("짐승의 소굴 8"); // 무한 — 로컬 번호 6 넘어 계속

    // 풀: 들판/깊은 산 = authored(MAIN_DUNGEON), 나머지 = 밴드.
    expect(enemiesForDepth(1)).toBe(MAIN_DUNGEON.floors[0].enemies); // 들판
    expect(enemiesForDepth(6)).toBe(enemiesForDepth(1)); // 들판 6깊이 동일 풀
    expect(enemiesForDepth(7)).toBe(MAIN_DUNGEON.floors[1].enemies); // 깊은 산
    expect(enemiesForDepth(13)).not.toBe(enemiesForDepth(12)); // 깊은산→마른협곡 전환
    expect(enemiesForDepth(48)).toBe(enemiesForDepth(43)); // 짐승의 소굴 상한
    expect(enemiesForDepth(999)).toBe(enemiesForDepth(43)); // 무한 반복

    // 8테마 각 대표 깊이 — 5종 + 인접 테마와 다른 풀.
    const themeReps = [1, 7, 13, 19, 25, 31, 37, 43];
    const themeNames = ["들판", "깊은 산", "마른 협곡", "얼음 호수", "심층 동굴", "잊힌 성소", "리자드 늪지", "짐승의 소굴"];
    for (let i = 0; i < themeReps.length; i++) {
      const pool = enemiesForDepth(themeReps[i]);
      expect(pool.length, `${themeNames[i]} 5종`).toBe(5);
      expect(depthName(themeReps[i]), `${themeNames[i]} 이름`).toContain(themeNames[i]);
      if (i > 0) {
        expect(pool, `${themeNames[i]} ≠ ${themeNames[i - 1]}`).not.toBe(
          enemiesForDepth(themeReps[i - 1]),
        );
      }
    }
    // 전 테마 키 V2_MONSTERS 존재 + statusSkill 은 monsterOnly v2 스킬.
    for (const d of themeReps) {
      for (const e of enemiesForDepth(d)) {
        expect(V2_MONSTERS[e.key], `${e.key} V2_MONSTERS 부재`).toBeDefined();
        if (e.statusSkill) {
          const s = V2_SKILLS[e.statusSkill];
          expect(s, `${e.statusSkill} 미존재`).toBeDefined();
          expect(s.monsterOnly, `${e.statusSkill} monsterOnly`).toBe(true);
        }
      }
    }
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

  it("들판 1 (×1.0) 은 동일 객체, 들판 6 은 완만 스케일(평탄화)", () => {
    const weak = MONSTERS["슬라임"];
    expect(scaleMonsterForFloor(weak, 1)).toBe(weak); // 깊이 1 = ×1.0 identity
    // 들판 평탄화: 깊이 2~6 은 ×1.06→×1.3 완만. 들판 6 = ×1.3 새 객체.
    const d6 = scaleMonsterForFloor(weak, 6);
    expect(d6).not.toBe(weak);
    expect(d6.hp).toBe(Math.round(weak.hp * floorStatMult(6)));
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
