import { describe, it, expect } from "vitest";
import {
  resolveBattle,
  type EquippedAPSkill,
  type PlayerCombat,
} from "../v2/combat/engine";
import type { Monster } from "../data/monsters";
import {
  getAPSkillByName,
  type APSkill,
  type APSkillCondition,
} from "../character/apSkills";

// AP 조건 빌드 시뮬 — 동일 시드/적/스탯 으로 두 빌드를 N 회 돌려 발동 횟수·총 데미지 비교.
// 단위 테스트가 아닌 "콤보가 의도대로 작동하는가" 검증용. 통계적 invariant 만 assert.

const PLAYER_BASE: PlayerCombat = {
  hp: 300,
  maxHp: 300,
  atk: 20,
  def: 8,
  spd: 12,
  evasionPct: 0,
  attackCount: 1,
};

const SHADOW_CUT = getAPSkillByName("그림자 베기")!;
const HEAVEN_SLAY = getAPSkillByName("천살")!;
const MENDING = getAPSkillByName("회복술")!;
const MADNESS = getAPSkillByName("광기")!;

function eq(skill: APSkill, condition: APSkillCondition = { kind: "always" }): EquippedAPSkill {
  return { skill, condition };
}

function makeEnemy(hp: number, atk = 18, def = 6): Monster {
  return { name: "더미", tags: ["beast"], hp, atk, def, spd: 8, exp: 0 };
}

type Stats = {
  battles: number;
  wins: number;
  totalTurns: number;
  fires: Record<string, number>;
  meaningfulHeals: number; // mending 발동 + 실제 회복량 > 0
  wastedHeals: number;     // mending 발동했는데 HP 클램프로 회복량 0
};

function runBatch(
  N: number,
  build: ReadonlyArray<EquippedAPSkill>,
  enemyHp: number,
): Stats {
  const out: Stats = {
    battles: 0,
    wins: 0,
    totalTurns: 0,
    fires: {},
    meaningfulHeals: 0,
    wastedHeals: 0,
  };
  for (let i = 0; i < N; i++) {
    const player: PlayerCombat = {
      ...PLAYER_BASE,
      equippedAPSkills: build,
    };
    const r = resolveBattle(player, makeEnemy(enemyHp), "용사", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
    });
    out.battles++;
    if (r.outcome === "win") out.wins++;
    out.totalTurns += r.turns;
    for (const e of r.finalState.log) {
      if (e.kind === "info" && e.text.startsWith("[회복술]")) {
        const m = e.text.match(/HP \+(\d+)/);
        const healed = m ? Number(m[1]) : 0;
        if (healed > 0) out.meaningfulHeals++;
        else out.wastedHeals++;
        out.fires["회복술"] = (out.fires["회복술"] ?? 0) + 1;
      }
      if (e.kind === "player_attack") {
        const m = e.text.match(/^\[([^\]]+)\]/);
        if (m) {
          for (const lbl of m[1].split(/\s*\+\s*/)) {
            if (lbl === "그림자 베기" || lbl === "천살" || lbl === "광기") {
              out.fires[lbl] = (out.fires[lbl] ?? 0) + 1;
            }
          }
        }
      }
      // 광기는 atk_multiplier 가 아니라 buff 라서 별도 info 로 기록되는 경우도 있다.
      if (e.kind === "info" && e.text.startsWith("[광기]")) {
        out.fires["광기"] = (out.fires["광기"] ?? 0) + 1;
      }
    }
  }
  return out;
}

function fmt(s: Stats): string {
  const fires = Object.entries(s.fires)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `wins ${s.wins}/${s.battles} | avg turns ${(s.totalTurns / s.battles).toFixed(1)} | fires {${fires}} | heals ${s.meaningfulHeals} 유효 / ${s.wastedHeals} 낭비`;
}

describe("AP 조건 빌드 시뮬 — 통계", () => {
  // 시뮬을 어떤 적 hp 로 돌릴지: B2(AP 저축→천살 버스트)가 턴 캡 안에 잡고 B1(그림자베기 연사)은
  // 못 잡는 마진 구간. 2026-05-23 방어 관통 완전무시→30% 로 버스트가 줄어 600→560 재튜닝.
  const ENEMY_HP = 560;
  const N = 100;

  it("방어 분리: mending(HP<50%) — 같은 슬롯 풀이 SC 로 흘러 클리어 속도 ↑", () => {
    // A1: slot1 mending(always) + slot2 SC. cost 같아서 slot1 만 발동 — SC 영원히 미발동.
    const a1 = runBatch(
      N,
      [eq(MENDING), eq(SHADOW_CUT)],
      ENEMY_HP,
    );
    // A2: slot1 mending(HP<50%) — 풀피일 때 미발동, 그 사이 slot2 SC 가 딜 누적.
    const a2 = runBatch(
      N,
      [eq(MENDING, { kind: "hp_below_pct", value: 50 }), eq(SHADOW_CUT)],
      ENEMY_HP,
    );

    console.log(`[방어 분리]`);
    console.log(`  A1 (mending always + SC)    : ${fmt(a1)}`);
    console.log(`  A2 (mending HP<50% + SC)    : ${fmt(a2)}`);

    // 두 빌드 모두 클리어 — 하지만 A2 가 SC 가 발동하면서 더 빠르게 잡는다.
    expect(a2.wins).toBeGreaterThanOrEqual(a1.wins - 5); // 둘 다 거의 100% 승률
    expect(a2.totalTurns).toBeLessThan(a1.totalTurns); // 더 빠른 클리어
    // A2 는 SC 가 실제로 발동 (A1 은 mending 만 발동).
    expect(a2.fires["그림자 베기"] ?? 0).toBeGreaterThan(a1.fires["그림자 베기"] ?? 0);
  });

  it("저축형 큰 한 방 (HP<50%): slot1 HS(always) + slot2 SC(HP<50%) — SC 가 AP 안 빨고 HS 발동 가능", () => {
    // B1: 둘 다 always (slot1 HS, slot2 SC). SC(cost 3) 가 slot2 에서 매 AP=3 마다 발동
    //     → HS 가 AP=5 까지 못 모음. HS=0.
    // 주: ap_at_most 로는 이 패턴을 표현 못 함 — SC ap_at_most:4 라도 AP=3 에서 fires,
    //     AP=4 에서 fires → AP 가 5 에 못 닿음 (cost 3 ≤ AP 3 인 순간 곧장 발동).
    //     실제로 저축이 되려면 SC 가 발동 안 하는 시나리오 (HP 안전한 평소엔 미발동) 가 필요.
    const b1 = runBatch(
      N,
      [eq(HEAVEN_SLAY), eq(SHADOW_CUT)],
      ENEMY_HP,
    );
    // B2: slot1 HS always, slot2 SC(HP<50%). 풀피일 땐 slot2 미발동 → AP 가 5 까지 모인다 → HS 발동.
    const b2 = runBatch(
      N,
      [eq(HEAVEN_SLAY), eq(SHADOW_CUT, { kind: "hp_below_pct", value: 50 })],
      ENEMY_HP,
    );

    console.log(`[저축형 큰 한 방]`);
    console.log(`  B1 (둘 다 always)            : ${fmt(b1)}`);
    console.log(`  B2 (HS always + SC HP<50%)  : ${fmt(b2)}`);

    const b1HS = b1.fires["천살"] ?? 0;
    const b2HS = b2.fires["천살"] ?? 0;
    expect(b2HS).toBeGreaterThan(b1HS);
    expect(b2.wins).toBeGreaterThan(b1.wins);
  });

  it("지속 버프 일찍 (enemy_hp_above_pct): 광기 가 적 풀피 구간에만 발동 — 막판 낭비 X", () => {
    // 광기 (3턴 ATK+30%) 는 적이 곧 죽을 때 걸면 의미 없음. 적HP ≥ 50% 조건으로 초반에만.
    // 적HP 50% 미만 구간엔 광기 가 안 걸리고, slot2 SC 가 발동해 막판 딜이 더 들어간다.
    const d1 = runBatch(
      N,
      [eq(MADNESS), eq(SHADOW_CUT)],
      ENEMY_HP,
    );
    const d2 = runBatch(
      N,
      [
        eq(MADNESS, { kind: "enemy_hp_above_pct", value: 50 }),
        eq(SHADOW_CUT),
      ],
      ENEMY_HP,
    );

    console.log(`[지속 버프 일찍]`);
    console.log(`  D1 (광기 always)             : ${fmt(d1)}`);
    console.log(`  D2 (광기 적HP≥50%)           : ${fmt(d2)}`);

    // D2 의 광기 발동이 D1 보다 적음 (적 50% 미만 구간에선 미발동).
    expect(d2.fires["광기"] ?? 0).toBeLessThan(d1.fires["광기"] ?? 0);
    // 적 50% 미만 구간엔 slot2 SC 가 발동 → D2 의 SC 가 D1 보다 많음.
    expect(d2.fires["그림자 베기"] ?? 0).toBeGreaterThan(d1.fires["그림자 베기"] ?? 0);
  });

  it("보스 게이트 (enemy_max_hp_at_least): HS 가 잡몹엔 발동 X, 보스에만 — cost 5 낭비 방지", () => {
    // HS 단독 슬롯으로 단순화 — 잡몹/보스에서 발동 여부만 비교.
    const smallEnemy = 200;
    const bossEnemy = 5000;
    const gated: ReadonlyArray<EquippedAPSkill> = [
      eq(HEAVEN_SLAY, { kind: "enemy_max_hp_at_least", value: 1000 }),
    ];
    const always: ReadonlyArray<EquippedAPSkill> = [eq(HEAVEN_SLAY)];

    const eSmallAlways = runBatch(N, always, smallEnemy);
    const eSmallGated = runBatch(N, gated, smallEnemy);
    const eBossGated = runBatch(N, gated, bossEnemy);

    console.log(`[보스 게이트]`);
    console.log(`  잡몹 ${smallEnemy} HP, HS always         : ${fmt(eSmallAlways)}`);
    console.log(`  잡몹 ${smallEnemy} HP, HS 적maxHP≥1000   : ${fmt(eSmallGated)}`);
    console.log(`  보스 ${bossEnemy} HP, HS 적maxHP≥1000   : ${fmt(eBossGated)}`);

    // 잡몹: always 면 HS 발동 (낭비), gated 면 HS 미발동.
    expect(eSmallAlways.fires["천살"] ?? 0).toBeGreaterThan(0);
    expect(eSmallGated.fires["천살"] ?? 0).toBe(0);
    // 보스: gated 라도 maxHP 가 임계 넘으면 발동.
    expect(eBossGated.fires["천살"] ?? 0).toBeGreaterThan(0);
  });

  it("주기 발동 (every_n_turns): 광기 가 X턴마다 정확히 — 자기 갱신 빈도 제어", () => {
    // 광기 always 면 매 AP=3 마다 발동 (cycle 3턴, 버프 3턴 — 사실상 항상 활성). cycle 정렬되어
    // no_self_effect_active 와 동일 결과.
    // every_n_turns:5 걸면 광기 가 5턴마다만 발동 → 버프 활성 (3턴) + 비활성 (2턴) 패턴.
    // AP 가 5턴마다만 빠지므로 slot2 SC 가 나머지 4턴에 발동할 기회.
    const f1 = runBatch(
      N,
      [eq(MADNESS), eq(SHADOW_CUT)],
      ENEMY_HP,
    );
    const f2 = runBatch(
      N,
      [
        eq(MADNESS, { kind: "every_n_turns", value: 5 }),
        eq(SHADOW_CUT),
      ],
      ENEMY_HP,
    );

    console.log(`[주기 발동]`);
    console.log(`  F1 (광기 always)             : ${fmt(f1)}`);
    console.log(`  F2 (광기 5턴마다)            : ${fmt(f2)}`);

    // 광기 발동 수 F2 < F1 (5턴마다라 빈도 ↓).
    expect(f2.fires["광기"] ?? 0).toBeLessThan(f1.fires["광기"] ?? 0);
    // F2 에선 slot2 SC 에 AP 흘러서 SC 발동 늘어남.
    expect(f2.fires["그림자 베기"] ?? 0).toBeGreaterThan(f1.fires["그림자 베기"] ?? 0);
  });

  it("AP 저축: heaven_slay 가 단독 슬롯이면 always 만으로도 발동", () => {
    // C1: HS 단독 + SC 단독. SC 가 AP 를 빠는 비교군.
    const c1 = runBatch(N, [eq(SHADOW_CUT)], ENEMY_HP);
    const c2 = runBatch(N, [eq(HEAVEN_SLAY)], ENEMY_HP);

    console.log(`[AP 저축 베이스라인]`);
    console.log(`  C1 (SC 단독)                : ${fmt(c1)}`);
    console.log(`  C2 (HS 단독)                : ${fmt(c2)}`);

    // SC 가 HS 보다 자주 발동 — cost 차이 (3 vs 5).
    expect(c1.fires["그림자 베기"] ?? 0).toBeGreaterThan(c2.fires["천살"] ?? 0);
  });
});
