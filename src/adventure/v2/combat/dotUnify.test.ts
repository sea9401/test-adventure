// PR-2 통합 DoT — 의도된 동작을 못박는 검증 테스트.
// 골든마스터는 행동 변경으로 재생성되므로 "정답"을 구분 못 한다. 이 파일이 진짜 오라클:
//   ① 피해 공식 (출혈=flat+ATK계수 / 중독=%최대HP + ATK연동 A상한 / 연소=flat)
//   ② 보스 A상한이 실제로 과녹임을 막는지 (저HP=무상한 / 고HP=상한)
//   ③ tag 분리 — 출혈·중독 공존, 같은 tag 누적
//   ④ 라이브 경로(resolveBattle)에서 적 DoT 가 실제로 틱하는지 (틱 사이트 이전 검증)
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  v2DotPerStackDamage,
  makeBleedDot,
  makePoisonDot,
  tickV2Dots,
  applyV2DotsToTarget,
  type V2Dot,
} from "./combatShared";
import { resolveBattle, type PlayerCombat } from "./engine";
import { pickAutoAction } from "./pickAutoAction";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import {
  BLEED_ATK_COEF_PER_STACK,
  POISON_CAP_ATK_COEF,
} from "@/adventure/data/v2/v2CombatConstants";
import type { Monster } from "@/adventure/data/monsters";

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

describe("PR-2 DoT 피해 공식", () => {
  it("출혈 = flatPerStack + sourceAtk × ATK계수 (HP 무관)", () => {
    const dot = makeBleedDot({ flatPerStack: 6, sourceAtk: 100 });
    // 6 + 100 × 0.08 = 14. targetMaxHp 무관.
    expect(v2DotPerStackDamage(dot, 1000)).toBeCloseTo(6 + 100 * BLEED_ATK_COEF_PER_STACK);
    expect(v2DotPerStackDamage(dot, 999999)).toBeCloseTo(6 + 100 * BLEED_ATK_COEF_PER_STACK);
  });

  it("중독 = %최대HP, 저HP 적은 상한 미적용(HP 비례 그대로)", () => {
    const dot = makePoisonDot({ pctMaxHpPerStack: 0.004, sourceAtk: 100 });
    // maxHp 1000 × 0.004 = 4, 상한 100×0.6=60 → min = 4 (HP 비례).
    expect(v2DotPerStackDamage(dot, 1000)).toBeCloseTo(4);
  });

  it("중독 보스 A상한 — 고HP 적은 ATK×k 로 상한(과녹임 차단)", () => {
    const dot = makePoisonDot({ pctMaxHpPerStack: 0.004, sourceAtk: 100 });
    // maxHp 50000 × 0.004 = 200 이지만 상한 100×0.6=60 → 60 으로 캡.
    const cap = 100 * POISON_CAP_ATK_COEF;
    expect(v2DotPerStackDamage(dot, 50000)).toBeCloseTo(cap);
    // 상한이 HP비례보다 작게 걸렸는지(=실제로 보호) 명시.
    expect(50000 * 0.004).toBeGreaterThan(cap);
  });

  it("연소 = flatPerStack (HP·ATK 무관)", () => {
    const burn: V2Dot = {
      tag: "burn",
      label: "연소",
      stacks: 1,
      maxStacks: 1,
      turns: 2,
      flatPerStack: 8,
      atkCoefPerStack: 0,
      pctMaxHpPerStack: 0,
      sourceAtk: 9999,
    };
    expect(v2DotPerStackDamage(burn, 100000)).toBe(8);
  });

  it("tick = 스택 × 스택당, 여러 tag 합산", () => {
    const bleed = makeBleedDot({ stacks: 3, flatPerStack: 6, sourceAtk: 100 }); // (6+8)*3=42
    const poison = makePoisonDot({ stacks: 2, pctMaxHpPerStack: 0.004, sourceAtk: 100 }); // min(4,60)*2=8
    const r = tickV2Dots([bleed, poison], 1000);
    expect(r.totalDmg).toBe(42 + 8);
  });

  it("tick 피해는 정수로 내림 (소수점 누수 차단)", () => {
    // perStack = 6 + 37×0.08 = 8.96 → 3스택 = 26.88 → floor 26 (26.88 아님).
    const bleed = makeBleedDot({ stacks: 3, flatPerStack: 6, sourceAtk: 37 });
    const r = tickV2Dots([bleed], 1000);
    expect(r.totalDmg).toBe(26);
    expect(Number.isInteger(r.totalDmg)).toBe(true);
  });
});

describe("PR-2 DoT tag 분리·누적", () => {
  it("출혈·중독 공존 (다른 tag)", () => {
    const out = applyV2DotsToTarget(
      [],
      [
        makeBleedDot({ flatPerStack: 6, sourceAtk: 100 }),
        makePoisonDot({ pctMaxHpPerStack: 0.004, sourceAtk: 100 }),
      ],
    );
    expect(out.map((d) => d.tag).sort()).toEqual(["bleed", "poison"]);
  });

  it("같은 tag 재부여 → 스택 누적(maxStacks 캡)", () => {
    let dots: readonly V2Dot[] = [];
    for (let i = 0; i < 15; i++) {
      dots = applyV2DotsToTarget(dots, [
        makeBleedDot({ flatPerStack: 6, sourceAtk: 100 }),
      ]);
    }
    const bleed = dots.find((d) => d.tag === "bleed")!;
    expect(bleed.stacks).toBe(bleed.maxStacks); // 10 캡
  });
});

describe("PR-2 라이브 경로 — 적 DoT 가 resolveBattle 에서 실제로 틱한다", () => {
  const derive = (over: Partial<PlayerCombat> = {}): PlayerCombat => ({
    ...derivePlayerCombatV2Pure({
      level: 50,
      playerClass: "warrior",
      allocatedStats: { str: 120, vit: 40 },
      v2Equipped: { weapon: "v2_steel_sword" } as never,
    }).player,
    ...over,
  });
  const m = (k: string): Monster => V2_MONSTERS[k];

  it("bleedOnHit 보유 시 적이 [출혈] 도트 피해를 받는다", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(1));
    const bleeder = derive({ bleedOnHit: { flatPerStack: 6, atkCoefPerStack: BLEED_ATK_COEF_PER_STACK } });
    const res = resolveBattle(bleeder, m("부서진 골렘"), "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    const bleedTick = res.finalState.log.some(
      (l) => l.text.includes("출혈") && l.text.includes("피해를 입혔다"),
    );
    expect(bleedTick).toBe(true);
  });

  it("DoT 미보유 평범한 빌드는 출혈 도트 로그가 없다(누출 가드)", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(1));
    const plain = derive();
    const res = resolveBattle(plain, m("부서진 골렘"), "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    const bleedTick = res.finalState.log.some(
      (l) => l.text.includes("출혈") && l.text.includes("피해를 입혔다"),
    );
    expect(bleedTick).toBe(false);
  });
});
