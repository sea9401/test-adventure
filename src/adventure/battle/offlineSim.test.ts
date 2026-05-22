import { describe, expect, it } from "vitest";
import {
  OFFLINE_SIM_MAX_MS,
  simulateOfflineHunt,
  summarizeOfflineResult,
  type OfflineSimInput,
} from "./offlineSim";
import type { Region } from "../data/world";
import type { PlayerCombat } from "./engine";

const TURN = 500;

// 평야 region — 실제 데이터 그대로 안 쓰고 테스트 픽스처로 슬라임 한 종만.
function makeRegion(enemies: string[]): Region {
  return {
    id: "plains",
    name: "평야",
    description: "",
    position: { x: 0, y: 0 },
    biome: "plains",
    enemies,
  };
}

const STRONG_PLAYER: PlayerCombat = {
  hp: 100,
  maxHp: 100,
  atk: 50, // 슬라임 def=0이라 1턴에 끝남
  def: 5,
  spd: 99,
  evasionPct: 0,
  attackCount: 1,
};

const FRAGILE_PLAYER: PlayerCombat = {
  hp: 1,
  maxHp: 1,
  atk: 1,
  def: 0,
  spd: 0,
  evasionPct: 0,
  attackCount: 1,
};

function baseInput(over: Partial<OfflineSimInput> = {}): OfflineSimInput {
  return {
    player: STRONG_PLAYER,
    playerName: "테스터",
    region: makeRegion(["슬라임"]),
    playerLevel: 99, // 신참 보너스 미적용 (기본 테스트는 base exp 검증)
    potions: {},
    turnIntervalMs: TURN,
    awayMs: 60_000, // 1분
    luk: 0,
    knowsRecipe: () => false,
    pickAction: () => ({ kind: "attack" }),
    // rng=0 — 첫 적 선택 + 드롭 굴림 항상 통과(0 < chance).
    // 슬라임의 lowest chance 가 0.003 이라 모든 드롭 발동되지만 테스트는 그 효과를
    // 직접 검증하지 않고 EXP/사망/cap 만 보므로 결과에 영향 없음.
    rng: () => 0,
    ...over,
  };
}

describe("simulateOfflineHunt", () => {
  it("적이 없는 region이면 시뮬레이션 0", () => {
    const r = simulateOfflineHunt(baseInput({ region: makeRegion([]) }));
    expect(r.battles).toBe(0);
    expect(r.simulatedMs).toBe(0);
  });

  it("awayMs가 0 이하면 즉시 종료", () => {
    const r = simulateOfflineHunt(baseInput({ awayMs: 0 }));
    expect(r.battles).toBe(0);
    expect(r.simulatedMs).toBe(0);
  });

  it("강한 플레이어는 cap까지 사망 없이 연속 처치", () => {
    const r = simulateOfflineHunt(baseInput({ awayMs: 30_000 }));
    expect(r.died).toBe(false);
    expect(r.wins).toBeGreaterThan(0);
    expect(r.killsByName["슬라임"]).toBe(r.wins);
    expect(r.simulatedMs).toBeLessThanOrEqual(30_000);
  });

  it("expLevelTrackingMult 은 레벨 추적 전용 — result.expGained(영속 캐시)는 raw 불변", () => {
    // L99(신참 없음·단일 밴드 90-100)에선 mult 가 레벨 추적에 영향을 줘도 expGained 는
    // 동일해야 한다 — 캐시(lastClaimResult)에 박히는 값은 raw 라는 불변식.
    const a = simulateOfflineHunt(
      baseInput({ awayMs: 30_000, expLevelTrackingMult: 1 }),
    );
    const b = simulateOfflineHunt(
      baseInput({ awayMs: 30_000, expLevelTrackingMult: 3 }),
    );
    expect(a.expGained).toBeGreaterThan(0);
    expect(b.expGained).toBe(a.expGained);
    expect(b.wins).toBe(a.wins);
  });

  it("OFFLINE_SIM_MAX_MS(1시간)을 넘는 awayMs는 cap + cappedByLimit=true", () => {
    const r = simulateOfflineHunt(
      baseInput({ awayMs: OFFLINE_SIM_MAX_MS * 5 }),
    );
    expect(r.cappedByLimit).toBe(true);
    expect(r.simulatedMs).toBeLessThanOrEqual(OFFLINE_SIM_MAX_MS);
  });

  it("약한 플레이어는 사망 시 부활 시퀀스로 대체된다 (사이클이 사망으로 끝나지 않음)", () => {
    // FRAGILE_PLAYER 는 1번 맞으면 죽음. awayMs=60s 인데 부활 페널티가 1200s 라
    // 첫 사망 후 부활 1회만 발동되고 elapsed 가 cap 을 초과해 루프 종료.
    const r = simulateOfflineHunt(
      baseInput({ player: FRAGILE_PLAYER, awayMs: 60_000 }),
    );
    expect(r.died).toBe(false);
    expect(r.revives).toBe(1);
    // 부활 후 maxHp(=1) 로 회복된 상태에서 끝남.
    expect(r.finalPlayerHp).toBe(FRAGILE_PLAYER.maxHp);
    // 작은 회복약 보유량이 0 이었으니 15까지 충전된다.
    expect(r.potionsGranted.potion_heal_s).toBe(15);
  });

  it("부활 보급은 보유량이 15 미만일 때만 차이만큼 지급 (이미 많으면 그대로)", () => {
    const r = simulateOfflineHunt(
      baseInput({
        player: FRAGILE_PLAYER,
        awayMs: 60_000,
        potions: { potion_heal_s: 12 },
      }),
    );
    expect(r.revives).toBe(1);
    // 12 → 15 까지 3개만 지급.
    expect(r.potionsGranted.potion_heal_s).toBe(3);
  });

  it("부활 보급은 이미 15 이상이면 0개", () => {
    const r = simulateOfflineHunt(
      baseInput({
        player: FRAGILE_PLAYER,
        awayMs: 60_000,
        potions: { potion_heal_s: 20 },
      }),
    );
    expect(r.revives).toBe(1);
    expect(r.potionsGranted.potion_heal_s ?? 0).toBe(0);
  });

  it("긴 사이클에서는 약한 플레이어가 여러 번 부활 — 매 사망마다 20분 페널티", () => {
    // 4시간 = 14400s. 부활 페널티 1200s × 12 = 14400 → 정확히 cap 직전까지 부활 가능.
    // 슬라임이 첫 턴에 죽이므로 elapsed 는 거의 페널티만으로 흐른다.
    const r = simulateOfflineHunt(
      baseInput({ player: FRAGILE_PLAYER, awayMs: 4 * 60 * 60 * 1000 }),
    );
    expect(r.died).toBe(false);
    expect(r.revives).toBeGreaterThanOrEqual(2);
  });

  it("승리 시 EXP가 누적된다", () => {
    const r = simulateOfflineHunt(baseInput({ awayMs: 10_000 }));
    // 슬라임 EXP는 monsters.ts에 정의된 값을 그대로 누적.
    expect(r.expGained).toBeGreaterThan(0);
    expect(r.expBonusApplied).toBe(false); // baseInput 은 playerLevel 99
  });

  it("신참 보너스 — playerLevel < 30 면 expGained ↑ + 플래그 true", () => {
    // EXP 페이싱 개편 후: 신참(L1)은 밴드 ×1.0 + 신참 ×2, 비교군(L99)은 밴드 ×1.55.
    // player 스탯은 고정이라 wins 동일 — 차이는 EXP 배율뿐. cross-level 정밀 ×2 비교는
    // 밴드가 레벨마다 달라 불가하므로 여기선 플래그 + 정성(신참이 더 많음)만 검증하고,
    // 정밀 ×2 는 leveling.test.ts 의 applyNewbieBonus 단위 테스트가 커버한다.
    const baseR = simulateOfflineHunt(baseInput({ awayMs: 10_000, playerLevel: 99 }));
    const newbieR = simulateOfflineHunt(baseInput({ awayMs: 10_000, playerLevel: 1 }));
    expect(newbieR.wins).toBe(baseR.wins);
    expect(newbieR.expBonusApplied).toBe(true);
    expect(baseR.expBonusApplied).toBe(false);
    expect(newbieR.expGained).toBeGreaterThan(baseR.expGained);
  });

  it("신참 보너스 — playerLevel < 30 면 드롭률도 ×2", () => {
    // 슬라임 drops: slime_chunk chance 0.15 / slime_core chance 0.015.
    // rng=0.2 로 두면 — base(×1): 0.15 → fail (0.2 >= 0.15). newbie(×2): 0.30 → pass (0.2 < 0.30).
    // 따라서 newbie 쪽만 slime_chunk 드롭이 매 처치마다 터지고, base 는 0.
    const baseR = simulateOfflineHunt(
      baseInput({ awayMs: 10_000, playerLevel: 99, rng: () => 0.2 }),
    );
    const newbieR = simulateOfflineHunt(
      baseInput({ awayMs: 10_000, playerLevel: 1, rng: () => 0.2 }),
    );
    const baseMatTotal = Object.values(baseR.materialsGained).reduce(
      (s, n) => s + (n ?? 0),
      0,
    );
    const newbieMatTotal = Object.values(newbieR.materialsGained).reduce(
      (s, n) => s + (n ?? 0),
      0,
    );
    expect(baseMatTotal).toBe(0);
    expect(newbieMatTotal).toBeGreaterThan(0);
  });

  it("신참 보너스 — sim 중 30 레벨 도달하면 그 시점부터 보너스 OFF", () => {
    // L29, 다음 레벨까지 거의 다 찬 exp. 슬라임 처치로 L30 도달.
    // requiredExpToNext(29) = floor(120 * 29^1.5) ≈ 18740.
    // 다음 슬라임 처치는 base exp(2) 만 적립.
    const aboutToLevel = simulateOfflineHunt(
      baseInput({
        awayMs: 60_000,
        playerLevel: 29,
        playerExp: 18730, // L29→30 직전
      }),
    );
    const stayedNewbie = simulateOfflineHunt(
      baseInput({
        awayMs: 60_000,
        playerLevel: 1,
        playerExp: 0,
      }),
    );
    // L29→30 케이스는 처음 몇 마리만 ×2 받고 나머진 base. stayedNewbie 는 전부 ×2.
    expect(aboutToLevel.expGained).toBeLessThan(stayedNewbie.expGained);
    expect(aboutToLevel.expBonusApplied).toBe(true); // 처음에는 발동했음
  });

  it("pickAction이 use_potion을 돌려도 보유량 0이면 attack으로 폴백 + 소비 0", () => {
    const r = simulateOfflineHunt(
      baseInput({
        awayMs: 5_000,
        potions: {},
        pickAction: () => ({
          kind: "use_potion",
          potionId: "potion_heal_s",
          potion: {
            id: "potion_heal_s",
            name: "x",
            description: "",
            effect: { kind: "heal_hp", flat: 1 },
            price: 0,
          },
        }),
      }),
    );
    expect(r.potionsConsumed.potion_heal_s ?? 0).toBe(0);
    // 그래도 전투는 진행되어야 함
    expect(r.battles).toBeGreaterThan(0);
  });

  it("HP가 충분히 남으면 다음 전투에 그 HP로 이어진다", () => {
    // 강한 플레이어이므로 마지막 전투 후 HP가 maxHp 이하 어딘가.
    const r = simulateOfflineHunt(baseInput({ awayMs: 60_000 }));
    expect(r.finalPlayerHp).toBeGreaterThan(0);
    expect(r.finalPlayerHp).toBeLessThanOrEqual(STRONG_PLAYER.maxHp);
  });
});

describe("summarizeOfflineResult", () => {
  it("아무 일도 없으면 빈 문자열", () => {
    const r = simulateOfflineHunt(baseInput({ region: makeRegion([]) }));
    expect(summarizeOfflineResult(r)).toBe("");
  });

  it("승리 + EXP가 있으면 토큰을 ' · '로 연결", () => {
    const r = simulateOfflineHunt(baseInput({ awayMs: 10_000 }));
    const text = summarizeOfflineResult(r);
    expect(text).toContain("처치");
    expect(text).toContain("EXP");
  });

  it("부활이 발생하면 '부활 N회' 토큰 포함", () => {
    const r = simulateOfflineHunt(
      baseInput({ player: FRAGILE_PLAYER, awayMs: 60_000 }),
    );
    expect(summarizeOfflineResult(r)).toContain("부활");
  });
});
