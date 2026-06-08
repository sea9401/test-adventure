import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBattle, type PlayerCombat } from "../v2/combat/engine";
import { pickAutoAction } from "../v2/combat/pickAutoAction";
import { emptyV2SkillsState } from "../data/v2/v2Skills";
import type { Monster } from "../data/monsters";

// 스킬 다단히트 — 추가 공격 확률(extraAttackChancePct)로 이 턴 굴려둔 공격 횟수(playerAttacksLeft)
//   만큼 데미지 스킬이 반복 타격한다. 평타 빌드가 누리는 SPD(추가 공격) 가치를 스킬 빌드에도 부여.
//   resolveBattle 의 스킬 데미지 적용부에만 존재. PvP 미러는 골든 마스터(combatGolden.test) 가 커버.

// 마력 탄막(v2c_mage_barrage) — 순수 3타 마법 데미지(DoT 없음) → 다단히트 배수 검증에 깔끔.
const BARRAGE = "v2c_mage_barrage";
const skills = {
  ...emptyV2SkillsState(),
  learned: [BARRAGE],
  equipped: [BARRAGE],
  // 조건 없이 매 턴 탄막 강제 발동(스킬 캐스트 경로 결정론화).
  pattern: {
    blocks: [
      { condition: { kind: "always" }, action: { kind: "skill", skillId: BARRAGE } },
    ],
  },
} as ReturnType<typeof emptyV2SkillsState>;

const MAGE: PlayerCombat = {
  hp: 5000,
  maxHp: 5000,
  atk: 1, // 평타는 무의미하게(스킬 데미지만 보도록)
  magicAtk: 300,
  def: 5,
  spd: 100, // 플레이어 선공
  accuracyPct: 100, // 빗나감 0 (스킬 미스 롤 비활성)
  evasionPct: 0,
  critChancePct: 0, // 크리 비활성(다단히트만 순수 측정)
  attackCount: 1,
  maxMp: 100000, // MP 무제한(매 턴 탄막)
};

function dummy(hp: number): Monster {
  return { name: "더미", tags: ["beast"], hp, atk: 1, def: 0, spd: 1, exp: 1 };
}

// Math.random 0 고정 → 추가 공격 굴림이 결정론(extraAttackChancePct=100 → 정확히 +1타, 200 → +2타).
//   첫 캐스트(플레이어 선공)의 연속 탄막 데미지 줄을 추출해 타수·총 데미지를 잰다.
function firstCast(extraAttackChancePct: number) {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const r = resolveBattle(
    { ...MAGE, extraAttackChancePct, hp: MAGE.maxHp },
    dummy(1_000_000), // 첫 캐스트가 적을 못 죽이게 큰 HP
    "마법사",
    {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: skills,
    },
  );
  // 로그 시작부의 첫 탄막 연속 블록 = 첫 캐스트의 모든 타격(평타 선공이라 사이에 다른 줄 없음).
  const hits: number[] = [];
  let started = false;
  for (const l of r.finalState.log) {
    const isBarrage =
      l.kind === "player_attack" && l.text.includes("마력 탄막");
    if (isBarrage) {
      started = true;
      hits.push(Number(l.text.match(/(\d+) 피해/)?.[1] ?? 0));
    } else if (started) {
      break;
    }
  }
  return { hitCount: hits.length, damage: hits.reduce((s, h) => s + h, 0), hits };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("스킬 다단히트 (추가 공격 확률)", () => {
  it("추가 공격 0 이면 단일 캐스트 = 스킬 본연 타수(3타)", () => {
    const single = firstCast(0);
    expect(single.hitCount).toBe(3);
    expect(single.damage).toBeGreaterThan(0);
  });

  it("추가 공격 100% → 첫 캐스트 타수·총 데미지 2배", () => {
    const single = firstCast(0);
    const doubled = firstCast(100); // playerAttacksLeft = 2 → 스킬 2회분 타격
    expect(doubled.hitCount).toBe(single.hitCount * 2);
    expect(doubled.damage).toBe(single.damage * 2);
  });

  it("추가 공격 200% → 첫 캐스트 타수·총 데미지 3배", () => {
    const single = firstCast(0);
    const tripled = firstCast(200); // playerAttacksLeft = 3 → 스킬 3회분 타격
    expect(tripled.hitCount).toBe(single.hitCount * 3);
    expect(tripled.damage).toBe(single.damage * 3);
  });

  it("다단히트는 1회분 타격 패턴의 반복 (per-hit 값 동일)", () => {
    const single = firstCast(0);
    const doubled = firstCast(100);
    // 2배 타격 = 1회분 hits 를 두 번 이어붙인 것.
    expect(doubled.hits).toEqual([...single.hits, ...single.hits]);
  });

  it("추가 공격 빌드가 더 빨리 처치 (다단히트 효과)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const run = (extra: number) =>
      resolveBattle(
        { ...MAGE, extraAttackChancePct: extra, hp: MAGE.maxHp },
        dummy(8000),
        "마법사",
        {
          pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
          potions: {},
          v2Skills: skills,
        },
      ).turns;
    expect(run(100)).toBeLessThan(run(0));
  });
});
