// 전투 골든 마스터 — v2 전투(derive → engine/pvp)의 동작을 스냅샷으로 못박는다.
// 목적: v1-이름 모듈에서 v2 전투를 분리하는 리팩터(상수 추출·엔진 이전·죽은코드 삭제)가
// 동작을 1비트도 바꾸지 않음을 보증한다. 엔진은 Math.random 을 직접 쓰므로 시드 PRNG 로
// 결정화한다. 리팩터는 로직 무변경이라 난수 호출 순서가 보존돼 지문(sha1)이 일치해야 한다.
//
// ⚠️ 이 스냅샷이 깨지면 = 리팩터가 전투 동작을 바꿨다는 뜻. 의도된 변경이 아니면 되돌릴 것.
// 이 파일은 의도적으로 v2 폴더(이전 안 함)에 둬 엔진 이전(Stage 2) 후에도 스냅샷 키가 안정적이다.

import { describe, it, expect, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { resolveBattle, type PlayerCombat } from "@/adventure/v2/combat/engine";
import { resolveBattlePvP } from "@/adventure/v2/combat/engine-pvp";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import type { Monster } from "@/adventure/data/monsters";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  emptyV2SkillsState,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  elementalSkillsForClass,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";

// 결정적 PRNG (mulberry32) — Math.random 대체.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

type DeriveInput = {
  level: number;
  playerClass?: V2Class;
  allocatedStats?: Partial<Record<V2StatKey, number>>;
  v2Equipped?: Record<string, string>;
};

function derive(input: DeriveInput): PlayerCombat {
  return derivePlayerCombatV2Pure({
    level: input.level,
    playerClass: input.playerClass ?? "none",
    allocatedStats: input.allocatedStats,
    v2Equipped: (input.v2Equipped ?? {}) as never,
  }).player;
}

function fingerprintPvE(
  label: string,
  player: PlayerCombat,
  enemy: Monster,
  opts: { isBoss?: boolean; v2Skills?: V2SkillsState; seed?: number } = {},
) {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(opts.seed ?? 1));
  const res = resolveBattle(player, enemy, "용사", {
    pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
    potions: {},
    isBoss: opts.isBoss,
    v2Skills: opts.v2Skills ?? emptyV2SkillsState(),
  });
  vi.restoreAllMocks();
  const fs = res.finalState;
  return {
    label,
    outcome: res.outcome,
    turns: fs.log.length,
    playerHp: fs.playerHp,
    enemyHp: fs.enemyHp,
    playerMp: fs.playerMp,
    logSha: createHash("sha1")
      .update(JSON.stringify(fs.log))
      .digest("hex"),
  };
}

function fingerprintPvP(
  label: string,
  p1: PlayerCombat,
  p2: PlayerCombat,
  seed = 1,
) {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
  // 빈 포션 설정의 pickAutoAction 은 항상 attack — PvE 와 동일 동작을 리터럴로(PvP state 형 회피).
  const res = resolveBattlePvP(p1, p2, "갑", "을", {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
  });
  vi.restoreAllMocks();
  const fs = res.finalState;
  return {
    label,
    outcome: res.outcome,
    turns: fs.log.length,
    logSha: createHash("sha1")
      .update(JSON.stringify(fs.log))
      .digest("hex"),
  };
}

// ── 빌드 매트릭스 (derive 로 실 PlayerCombat 생성) ──
const builds = {
  warrior: derive({
    level: 50,
    playerClass: "warrior",
    allocatedStats: { str: 120, vit: 40 },
    v2Equipped: { weapon: "v2_greatsword", armor: "v2_full_plate" },
  }),
  mage: derive({
    level: 50,
    playerClass: "mage",
    allocatedStats: { int: 120, spi: 30 },
    v2Equipped: { weapon: "v2_oak_staff" },
  }),
  archer: derive({
    level: 50,
    playerClass: "rogue",
    allocatedStats: { dex: 120, luk: 40 },
    v2Equipped: { weapon: "v2_starsong_bow" },
  }),
  ninja: derive({
    level: 50,
    playerClass: "rogue",
    allocatedStats: { luk: 120, dex: 40 },
    v2Equipped: { weapon: "v2_assassin_dagger" },
  }),
  tank: derive({
    level: 50,
    playerClass: "martial",
    allocatedStats: { vit: 140, str: 30 },
    v2Equipped: { armor: "v2_full_plate" },
  }),
  lowbie: derive({ level: 5, playerClass: "warrior", allocatedStats: { str: 8 } }),
};

describe("골든: derive PlayerCombat 스냅샷 (Stage 1 상수 이관 가드)", () => {
  for (const [name, p] of Object.entries(builds)) {
    it(`derive[${name}]`, () => {
      expect(p).toMatchSnapshot();
    });
  }
});

describe("골든: resolveBattle PvE 지문 (엔진 가드)", () => {
  const m = (k: string): Monster => V2_MONSTERS[k];
  // 직업 패시브 엔진훅을 강제로 켜 분기 커버 (derive 가 학습스킬 없이 0 일 수 있어 명시).
  const magicCaster: PlayerCombat = {
    ...builds.mage,
    passiveMagicBasicAttack: true,
    passiveMagicAtkBonus: 30,
  } as PlayerCombat;
  const counterTank: PlayerCombat = {
    ...builds.tank,
    spd: 1,
    passiveCounterChancePct: 45,
  } as PlayerCombat;
  const penArcher: PlayerCombat = {
    ...builds.archer,
    passiveDefPenetrationPct: 28,
  } as PlayerCombat;
  const healPriest: PlayerCombat = {
    ...builds.tank,
    passiveTurnHealPctMaxHp: 8,
  } as PlayerCombat;
  const mageSkills: V2SkillsState = (() => {
    const ids = elementalSkillsForClass("mage").slice(0, 2);
    return { ...emptyV2SkillsState(), learned: ids, equipped: ids };
  })();

  const cases = [
    fingerprintPvE("warrior_vs_들개", builds.warrior, m("들개")),
    fingerprintPvE("warrior_vs_골렘", builds.warrior, m("부서진 골렘"), {
      seed: 7,
    }),
    fingerprintPvE("ninja_crit_vs_늑대", builds.ninja, m("절벽 늑대"), {
      seed: 3,
    }),
    fingerprintPvE("archer_pen_vs_골렘", penArcher, m("부서진 골렘"), {
      seed: 5,
    }),
    fingerprintPvE("magic_vs_약탈자", magicCaster, m("떠돌이 약탈자"), {
      seed: 9,
    }),
    fingerprintPvE("counter_tank_vs_들소", counterTank, m("들소"), { seed: 2 }),
    fingerprintPvE("heal_vs_들소_boss", healPriest, m("들소"), {
      isBoss: true,
      seed: 4,
    }),
    fingerprintPvE("mage_skills_vs_골렘", builds.mage, m("부서진 골렘"), {
      v2Skills: mageSkills,
      seed: 6,
    }),
    fingerprintPvE("lowbie_vs_들개", builds.lowbie, m("들개"), { seed: 11 }),
  ];

  it("PvE 지문 매트릭스", () => {
    expect(cases).toMatchSnapshot();
  });
});

// ── 적 페이즈 메커닉 커버리지 (advanceTurn 적 페이즈 헬퍼 추출 가드) ──
// 기존 PvE 매트릭스는 기본 직군의 평타 위주라 적 페이즈 분기(DoT 틱·한기·반사·회피
// 캐스케이드·잡몹 스킬)를 거의 안 밟는다. advanceTurn 을 phase 헬퍼로 쪼갤 때 이 경로들이
// 1비트도 안 바뀜을 보증하기 위해 각 메커닉을 강제로 켠 케이스를 별도로 못박는다.
describe("골든: 적 페이즈 메커닉 커버리지 (리팩터 가드)", () => {
  const m = (k: string): Monster => V2_MONSTERS[k];
  const withSkill = (base: Monster, skill: Monster["skill"]): Monster => ({
    ...base,
    skill,
  });

  // 적에 출혈·중독 부착 → 적 페이즈 진입 시 enemy DoT 틱 경로.
  const dotter: PlayerCombat = {
    ...builds.warrior,
    bleedOnHit: { flatPerStack: 4, atkCoefPerStack: 0.08 },
    poisonOnHit: { pctMaxHpPerStack: 0.01 },
  } as PlayerCombat;

  // 피격 분기 — 무한 가시 + 가시 갑옷 반사 + 굳건한 의지 평탄 감소.
  const thornTank: PlayerCombat = {
    ...builds.tank,
    infiniteThornsAtkPct: 30,
    bramblePct: 25,
    steadfastWillFlat: 5,
  } as PlayerCombat;

  // 회피 캐스케이드 — 그림자 보법 + 보장 회피 + 회피 반사.
  const evader: PlayerCombat = {
    ...builds.ninja,
    reflexEvadeMult: 0.5,
    shadowStepPct: 30,
    guaranteedEvades: 2,
  } as PlayerCombat;

  const cases = [
    fingerprintPvE("enemy_dot_tick", dotter, m("부서진 골렘"), { seed: 21 }),
    fingerprintPvE(
      "chill_enemy",
      builds.tank,
      withSkill(m("부서진 골렘"), {
        kind: "chill",
        name: "한기",
        perHit: 2,
        dmgPerStack: 6,
        threshold: 2,
        maxStacks: 20,
      }),
      { seed: 22 },
    ),
    fingerprintPvE("thorns_reflect", thornTank, m("부서진 골렘"), { seed: 23 }),
    fingerprintPvE("evade_reflect", evader, m("들소"), { seed: 24 }),
    fingerprintPvE(
      "enrage_enemy",
      builds.warrior,
      withSkill(m("부서진 골렘"), {
        kind: "enrage",
        name: "격노",
        hpFraction: 0.5,
        atkBonus: 10,
      }),
      { seed: 25 },
    ),
    fingerprintPvE(
      "brace_enemy",
      builds.warrior,
      withSkill(m("부서진 골렘"), {
        kind: "brace",
        name: "방어 태세",
        damageReduction: 8,
      }),
      { seed: 26 },
    ),
    fingerprintPvE(
      "heavyblow_enemy",
      builds.tank,
      withSkill(m("들소"), {
        kind: "heavy_blow",
        name: "강타",
        everyPhases: 2,
        multiplier: 2,
      }),
      { seed: 27 },
    ),
  ];

  it("적 페이즈 메커닉 매트릭스", () => {
    expect(cases).toMatchSnapshot();
  });
});

describe("골든: resolveBattlePvP 지문 (PvP 엔진 가드)", () => {
  const cases = [
    fingerprintPvP("warrior_vs_mage", builds.warrior, builds.mage, 1),
    fingerprintPvP("archer_vs_ninja", builds.archer, builds.ninja, 8),
    fingerprintPvP("tank_vs_warrior", builds.tank, builds.warrior, 15),
  ];
  it("PvP 지문 매트릭스", () => {
    expect(cases).toMatchSnapshot();
  });
});
