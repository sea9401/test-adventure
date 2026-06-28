import { describe, it, expect } from "vitest";
import {
  rollLevelGrowth,
  computeStatFloors,
  V2_GROWTH_POINTS_PER_LEVEL,
} from "./statGrowth";
import { emptyProficiency, parseProficiency } from "./proficiency";
import { V2_BASE_STATS } from "./v2Stats";

describe("v2 랜덤 레벨 성장", () => {
  it("레벨 1회 = POINTS 만큼 +1 (cap 여유 시)", () => {
    const grown = rollLevelGrowth({}, "warrior", emptyProficiency(), () => 0.5);
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(V2_GROWTH_POINTS_PER_LEVEL);
  });

  it("앵커 가중 — rng 가 앵커 구간(작은 값)이면 앵커에 몰림", () => {
    // 검사(warrior) 앵커=str(가중 3/8). rng=0.1 → 매 포인트 str 선택.
    const grown = rollLevelGrowth({}, "warrior", emptyProficiency(), () => 0.1);
    expect(grown.str).toBe(V2_GROWTH_POINTS_PER_LEVEL);
    expect(grown.int).toBeUndefined();
  });

  it("cap 에서 멈춤 — 앵커가 cap 가득이면 그 포인트는 다른 스탯으로(낭비 없음)", () => {
    const prof = parseProficiency({ groups: {}, caps: {} }); // 전 스탯 cap = 60 기본
    const base = V2_BASE_STATS.str;
    const grown0 = { str: 60 - base }; // str 이미 cap(60)
    const grown = rollLevelGrowth(grown0, "warrior", prof, () => 0.1);
    expect(grown.str).toBe(60 - base); // 안 오름
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(60 - base + V2_GROWTH_POINTS_PER_LEVEL); // 5점 다른 스탯
  });

  it("none(무직) = 균등 가중, 비파괴", () => {
    const grown0 = { str: 2 };
    const grown = rollLevelGrowth(grown0, "none", emptyProficiency(), () => 0.99);
    const total = Object.values(grown).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(2 + V2_GROWTH_POINTS_PER_LEVEL);
    expect(grown0.str).toBe(2); // 원본 비파괴
  });

  it("targetStats(자유 수행) — 클래스 앵커 대신 선택 스탯이 최다 성장", () => {
    // 결정론 LCG rng(테스트용) — 매번 새 인스턴스(같은 시드열).
    const mkRng = () => {
      let s = 12345;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    // warrior 앵커=str. 자유 수행 target=[spi] → spi(앵커 아님)가 최다·str 추월.
    const r = mkRng();
    let g = rollLevelGrowth({}, "warrior", emptyProficiency(), r, ["spi"]);
    for (let i = 0; i < 11; i++)
      g = rollLevelGrowth(g, "warrior", emptyProficiency(), r, ["spi"]);
    const top = Object.entries(g).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    expect(top[0]).toBe("spi"); // 최다 성장 = 선택 스탯(앵커 무시)
    expect(g.spi ?? 0).toBeGreaterThan(g.str ?? 0); // 앵커보다 큼

    // 대조: target 없으면 앵커(str)가 우세.
    const r2 = mkRng();
    let g2 = rollLevelGrowth({}, "warrior", emptyProficiency(), r2);
    for (let i = 0; i < 11; i++)
      g2 = rollLevelGrowth(g2, "warrior", emptyProficiency(), r2);
    expect(g2.str ?? 0).toBeGreaterThan(g2.spi ?? 0); // 앵커 우세
  });
});

describe("v2 스탯 floor", () => {
  it("computeStatFloors — 총(전 스탯) + 직군 숙련도(프로필·차수 가중)", () => {
    // 전사(warrior {str:2,vit:1,dex:1}) 숙련도 1200(밸런스 입력 200), tier1. 총=200×0.015=3.
    // 프로필 값 비례: str(2/2=1.0)·vit/dex(1/2=0.5). FLOOR_GLOBAL 0.015·FLOOR_PER_PROF 0.05.
    const prof = parseProficiency({
      groups: {
        warrior: { points: 10, cultivations: 0, tier: 1, cumLevel: 1200 },
      },
    });
    const f = computeStatFloors(prof);
    // str = base + 3(총) + 200×0.05×1×1.0 = base + 3 + 10
    expect(f.str).toBe(V2_BASE_STATS.str + 3 + 10);
    // dex = base + 3(총) + 200×0.05×1×0.5 = base + 3 + 5
    expect(f.dex).toBe(V2_BASE_STATS.dex + 3 + 5);
    // int(프로필 외) = base + 3(총만)
    expect(f.int).toBe(V2_BASE_STATS.int + 3);
  });

  it("computeStatFloors — 프로필 값 비례: 마법사 spi=int·도적 luk=dex (값2 동급)", () => {
    // 옛 앵커-이진에선 spi/luk 이 0.4 로 홀대됐으나, 값 비례에서 값2는 모두 1.0(주력 동급).
    const mage = computeStatFloors(
      parseProficiency({
        groups: { mage: { points: 0, cultivations: 0, tier: 1, cumLevel: 1200 } },
      }),
    );
    // mage {int:2, spi:2} — 둘 다 최댓값 → floor 1.0 동급 = base + 3 + 10.
    expect(mage.int).toBe(V2_BASE_STATS.int + 3 + 10);
    expect(mage.spi).toBe(mage.int);
    const rogue = computeStatFloors(
      parseProficiency({
        groups: { rogue: { points: 0, cultivations: 0, tier: 1, cumLevel: 1200 } },
      }),
    );
    // rogue {dex:2, luk:2} — luk 이 dex 와 동급.
    expect(rogue.luk).toBe(rogue.dex);
  });

  it("computeStatFloors — 차수 높을수록 floor↑, 빈 숙련도는 base", () => {
    const mk = (tier: number) =>
      computeStatFloors(
        parseProficiency({
          groups: {
            warrior: { points: 10, cultivations: 0, tier, cumLevel: 1200 },
          },
        }),
      );
    expect(mk(3).str).toBeGreaterThan(mk(1).str);
    expect(computeStatFloors(emptyProficiency()).str).toBe(V2_BASE_STATS.str);
  });

  it("computeStatFloors — cumLevel 0(미적립)이면 직군 가중 없음, base + 총만", () => {
    // 잔액(points)만 있고 cumLevel 0 → 직군 floor 기여 없음(floor 입력이 cumLevel 이므로).
    const prof = parseProficiency({
      groups: {
        warrior: { points: 9999, cultivations: 0, tier: 4, cumLevel: 0 },
      },
    });
    const f = computeStatFloors(prof);
    expect(f.str).toBe(V2_BASE_STATS.str);
  });
});
