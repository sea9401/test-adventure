import { describe, it, expect } from "vitest";
import {
  MAIN_DUNGEON,
  enemiesForDepth,
  depthName,
  dungeonThemeGroups,
  dungeonThemeCatalog,
  MAX_FRONTIER_DEPTH,
} from "./dungeon";
import { scaleMonsterForFloor } from "./monsterScale";
import {
  floorStatMult,
  floorDefMult,
  floorExpMult,
  floorCritHpComp,
} from "./dungeonLadder";
import { MONSTERS } from "../monsters";
import { V2_MONSTERS } from "./v2Monsters";
import { V2_ELEMENTS, type V2Element } from "./elements";
import { V2_SKILLS } from "./v2Skills";

describe("dungeonThemeGroups — 사냥터 목록 2단 그룹핑", () => {
  it("깊이 1..maxDepth 를 ≤6깊이 블록으로 묶고, 전부 빠짐없이 단조 커버", () => {
    for (const max of [3, 8, 14, 25, 50]) {
      const groups = dungeonThemeGroups(max);
      const flat = groups.flatMap((g) => g.depths);
      // 1..max 전부, 순서대로, 중복 없음.
      expect(flat).toEqual(Array.from({ length: max }, (_, i) => i + 1));
      // 한 블록은 항상 ≤6 깊이.
      for (const g of groups) {
        expect(g.depths.length).toBeLessThanOrEqual(6);
        expect(g.depths.length).toBeGreaterThan(0);
        expect(g.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("블록 이름은 테마 순서대로, 무한 마지막 테마는 6깊이씩 블록 분할", () => {
    const groups = dungeonThemeGroups(50);
    expect(groups[0].name).toBe("들판"); // 1~6
    expect(groups[0].depths).toEqual([1, 2, 3, 4, 5, 6]);
    expect(groups[1].name).toBe("마른 협곡"); // 7~12 (깊은 산 삭제 후)
    // 50깊이 → 짐승의 소굴(37~42, 43~48, 49~50) 세 블록(무한 테마도 ≤6).
    const den = groups.filter((g) => g.name === "짐승의 소굴");
    expect(den.length).toBe(3);
    expect(den[0].depths).toEqual([37, 38, 39, 40, 41, 42]);
    expect(den[1].depths).toEqual([43, 44, 45, 46, 47, 48]);
    expect(den[2].depths).toEqual([49, 50]);
  });
});

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

  it("MAIN_DUNGEON.floors = 들판 onboarding 풀(코덱스/dev용, 1종 — 깊은 산 삭제 후)", () => {
    expect(MAIN_DUNGEON.floors.map((f) => f.id)).toEqual([1]);
    expect(MAIN_DUNGEON.floors[0].name).toBe("들판");
  });

  it("enemiesForDepth / depthName — 테마당 6깊이, 테마 내 로컬 번호 표시", () => {
    // 들판(1~6)·마른협곡(7~12)·얼음호수(13~18)·심층동굴(19~24)·
    // 잊힌성소(25~30)·리자드늪지(31~36)·짐승의소굴(37~42=프론티어 끝). 깊은 산 삭제 후.
    expect(depthName(1)).toBe("들판 1");
    expect(depthName(6)).toBe("들판 6");
    expect(depthName(7)).toBe("마른 협곡 1");
    expect(depthName(12)).toBe("마른 협곡 6");
    expect(depthName(13)).toBe("얼음 호수 1");
    expect(depthName(37)).toBe("짐승의 소굴 1");
    expect(depthName(42)).toBe("짐승의 소굴 6");
    expect(depthName(44)).toBe("짐승의 소굴 8"); // 캡(42) 밖=도달 불가, 방어적 클램프 표시만

    // 풀: 들판 = authored(MAIN_DUNGEON), 나머지 = 밴드(마른 협곡부터).
    expect(enemiesForDepth(1)).toBe(MAIN_DUNGEON.floors[0].enemies); // 들판
    expect(enemiesForDepth(6)).toBe(enemiesForDepth(1)); // 들판 6깊이 동일 풀
    expect(enemiesForDepth(7)).not.toBe(enemiesForDepth(6)); // 들판→마른협곡 전환
    expect(enemiesForDepth(12)).toBe(enemiesForDepth(7)); // 마른 협곡 6깊이 동일 풀
    expect(enemiesForDepth(13)).not.toBe(enemiesForDepth(12)); // 마른협곡→얼음호수 전환
    expect(enemiesForDepth(42)).toBe(enemiesForDepth(37)); // 짐승의 소굴 상한
    expect(enemiesForDepth(999)).toBe(enemiesForDepth(37)); // 캡 밖도 방어적 클램프(도달 불가)

    // 7테마 각 대표 깊이 — 5종 + 인접 테마와 다른 풀.
    const themeReps = [1, 7, 13, 19, 25, 31, 37];
    const themeNames = ["들판", "마른 협곡", "얼음 호수", "심층 동굴", "잊힌 성소", "리자드 늪지", "짐승의 소굴"];
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

  it("MAX_FRONTIER_DEPTH = 마지막 테마 끝(테마수 × 6) — 무한 반복 안 함, 새 테마 추가 시 자동 확장", () => {
    // 7테마 × 6깊이 = 42. 짐승의 소굴 6(깊이 42)이 프론티어의 끝.
    expect(MAX_FRONTIER_DEPTH).toBe(42);
    expect(depthName(MAX_FRONTIER_DEPTH)).toBe("짐승의 소굴 6");
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

  it("authored 구역(들판)은 코스믹(별빛/공허) 미등장 — 온보딩 보호", () => {
    // 코스믹은 엔드 구역에만 있었고 축소로 제거. 들판은 전부 자연/무속성.
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
    // hp 는 크리 HP 상쇄(floorCritHpComp) 까지 곱해짐 — atk/def/exp 는 미적용.
    expect(scaled.hp).toBe(
      Math.round(base.hp * floorStatMult(8) * floorCritHpComp(8)),
    );
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

describe("dungeonThemeCatalog (코덱스 사냥터 도감)", () => {
  it("도달 전(maxDepth<1) → 빈 배열", () => {
    expect(dungeonThemeCatalog(0)).toEqual([]);
    expect(dungeonThemeCatalog(-3)).toEqual([]);
  });

  it("부분 도달 — 닿은 테마만, depthEnd 는 도달 깊이로 클램프", () => {
    const c = dungeonThemeCatalog(2); // 들판(1~6) 중 깊이 2까지
    expect(c).toHaveLength(1);
    expect(c[0].name).toBe("들판");
    expect(c[0].depthStart).toBe(1);
    expect(c[0].depthEnd).toBe(2); // 도달 깊이로 클램프("처리한 깊이 기준")
    expect(c[0].enemies.length).toBeGreaterThan(0);
  });

  it("마른 협곡 진입 — 들판 풀 + 마른 협곡(7~clamp)", () => {
    const c = dungeonThemeCatalog(8);
    expect(c.map((t) => t.name)).toEqual(["들판", "마른 협곡"]);
    expect(c[0].depthEnd).toBe(6); // 들판은 풀 6
    expect(c[1].depthStart).toBe(7);
    expect(c[1].depthEnd).toBe(8); // 도달 8
  });

  it("무한 마지막 테마(짐승의 소굴) — 중복 카드 없이 한 장으로 합침", () => {
    const c = dungeonThemeCatalog(50);
    expect(c).toHaveLength(7); // 7 테마(깊은 산 삭제 후), 중복 없음
    const last = c[c.length - 1];
    expect(last.name).toBe("짐승의 소굴");
    expect(last.depthStart).toBe(37);
    expect(last.depthEnd).toBe(50); // 무한 테마는 maxDepth 까지 한 카드
    // 테마명 중복 없음
    expect(new Set(c.map((t) => t.name)).size).toBe(c.length);
  });
});
