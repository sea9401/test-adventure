export type UnexploredRewardValuation = {
  goldFaceValue?: number;
  equipmentNpcSaleValue?: number;
  baseMaterialMedianValue?: number;
  specialMaterialMedianValue?: number;
  rareMaterialMedianValue?: number;
  regularUniqueMedianValue?: number;
  /** 완성 소환석 가치에서 다른 제작비를 차감한 흔적 환산 중앙값. */
  traceMedianValue?: number;
  /** 보수적인 일반 사냥 수익 지표에서는 의도적으로 제외한다. */
  ultraRareUniqueMarketValue?: number;
  /** 사용처가 추가되기 전까지 의도적으로 제외한다. */
  unusedBossCoreMarketValue?: number;
};

export type UnexploredRewardFixture = {
  id: string;
  job: string;
  build: string;
  winRate: number;
  winBattleSeconds: number;
  lossBattleSeconds: number;
  winStamina: number;
  lossStamina: number;
  hpMpChargeOnWin: number;
  hpMpChargeOnLoss: number;
  lossTax: number;
};

export type UnexploredRewardFixtureResult = {
  fixtureId: string;
  job: string;
  build: string;
  configuredWinRatePct: number;
  wins: number;
  losses: number;
  stable: boolean;
  grossValue: number;
  costValue: number;
  netValue: number;
  staminaSpent: number;
  elapsedSeconds: number;
  per100StaminaNet: number;
  perHourNet: number;
};

export type UnexploredStableRewardSummary = {
  stablePlayerCount: number;
  excludedPlayerCount: number;
  netValue: number;
  staminaSpent: number;
  elapsedSeconds: number;
  per100StaminaNet: number;
  perHourNet: number;
};

const STABLE_WIN_RATE = 0.7;

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function rate(value: unknown): number {
  return Math.min(1, nonNegative(value));
}

export function includedUnexploredRewardValue(
  valuation: UnexploredRewardValuation,
): number {
  return (
    nonNegative(valuation.goldFaceValue) +
    nonNegative(valuation.equipmentNpcSaleValue) +
    nonNegative(valuation.baseMaterialMedianValue) +
    nonNegative(valuation.specialMaterialMedianValue) +
    nonNegative(valuation.rareMaterialMedianValue) +
    nonNegative(valuation.regularUniqueMedianValue) +
    nonNegative(valuation.traceMedianValue)
  );
}

export function simulateUnexploredRewardFixture({
  fixture,
  rewards,
  runs,
  rng,
}: {
  fixture: UnexploredRewardFixture;
  rewards: UnexploredRewardValuation;
  runs: number;
  rng: () => number;
}): UnexploredRewardFixtureResult {
  const attempts = Math.max(1, Math.floor(nonNegative(runs)));
  const configuredWinRate = rate(fixture.winRate);
  const rewardValue = includedUnexploredRewardValue(rewards);
  let wins = 0;
  let losses = 0;
  let grossValue = 0;
  let costValue = 0;
  let staminaSpent = 0;
  let elapsedSeconds = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const won = rate(rng()) < configuredWinRate;
    if (won) {
      wins += 1;
      grossValue += rewardValue;
      costValue += nonNegative(fixture.hpMpChargeOnWin);
      staminaSpent += nonNegative(fixture.winStamina);
      elapsedSeconds += nonNegative(fixture.winBattleSeconds);
    } else {
      losses += 1;
      costValue +=
        nonNegative(fixture.hpMpChargeOnLoss) + nonNegative(fixture.lossTax);
      staminaSpent += nonNegative(fixture.lossStamina);
      elapsedSeconds += nonNegative(fixture.lossBattleSeconds);
    }
  }

  const netValue = grossValue - costValue;
  return {
    fixtureId: fixture.id,
    job: fixture.job,
    build: fixture.build,
    configuredWinRatePct: configuredWinRate * 100,
    wins,
    losses,
    stable: configuredWinRate >= STABLE_WIN_RATE,
    grossValue,
    costValue,
    netValue,
    staminaSpent,
    elapsedSeconds,
    per100StaminaNet:
      staminaSpent > 0 ? (netValue / staminaSpent) * 100 : 0,
    perHourNet:
      elapsedSeconds > 0 ? (netValue / elapsedSeconds) * 3_600 : 0,
  };
}

export function summarizeStableUnexploredRewards(
  results: readonly UnexploredRewardFixtureResult[],
): UnexploredStableRewardSummary {
  const stable = results.filter((result) => result.stable);
  const netValue = stable.reduce((sum, result) => sum + result.netValue, 0);
  const staminaSpent = stable.reduce(
    (sum, result) => sum + result.staminaSpent,
    0,
  );
  const elapsedSeconds = stable.reduce(
    (sum, result) => sum + result.elapsedSeconds,
    0,
  );
  return {
    stablePlayerCount: stable.length,
    excludedPlayerCount: results.length - stable.length,
    netValue,
    staminaSpent,
    elapsedSeconds,
    per100StaminaNet:
      staminaSpent > 0 ? (netValue / staminaSpent) * 100 : 0,
    perHourNet:
      elapsedSeconds > 0 ? (netValue / elapsedSeconds) * 3_600 : 0,
  };
}

export const UNEXPLORED_REWARD_TARGET_PCT = {
  95: 110,
  100: 122,
  105: 136,
  110: 150,
  115: 165,
  120: 180,
} as const;

export type FixedUnexploredRewardScenario = {
  id: string;
  label: string;
  difficulty: 95 | 100 | 105 | 110 | 115 | 120;
  targetPct: number | null;
  rewards: UnexploredRewardValuation;
};

type RewardShape = "balanced" | "gold" | "collector" | "armory" | "trace";

function rewardBundle(
  total: number,
  shape: RewardShape = "balanced",
): UnexploredRewardValuation {
  const shares: Record<
    RewardShape,
    readonly [number, number, number, number, number, number]
  > = {
    // 일반·특화 재료 공급을 골드보다 낮게 유지하는 출시 전 보수적 가치 배분.
    balanced: [0.35, 0.3, 0.18, 0.07, 0.1, 0],
    gold: [0.58, 0.2, 0.1, 0.04, 0.08, 0],
    collector: [0.14, 0.14, 0.36, 0.23, 0.13, 0],
    armory: [0.16, 0.52, 0.16, 0.06, 0.1, 0],
    trace: [0.24, 0.22, 0.16, 0.08, 0.1, 0.2],
  };
  const [
    gold,
    equipment,
    baseMaterial,
    specialMaterial,
    rareMaterial,
    trace,
  ] = shares[shape];
  return {
    goldFaceValue: total * gold,
    equipmentNpcSaleValue: total * equipment,
    baseMaterialMedianValue: total * baseMaterial,
    specialMaterialMedianValue: total * specialMaterial,
    rareMaterialMedianValue: total * rareMaterial,
    traceMedianValue: total * trace,
    ultraRareUniqueMarketValue: 50_000_000,
    unusedBossCoreMarketValue: 10_000_000,
  };
}

export function fixedUnexploredRewardScenarios(): FixedUnexploredRewardScenario[] {
  return [
    { id: "base-95", label: "기본 95", difficulty: 95, targetPct: 110, rewards: rewardBundle(113_000) },
    { id: "reward-95", label: "보상 집중 95", difficulty: 95, targetPct: 110, rewards: rewardBundle(113_000) },
    { id: "reward-100", label: "보상 집중 100", difficulty: 100, targetPct: 122, rewards: rewardBundle(126_000) },
    { id: "reward-105", label: "보상 집중 105", difficulty: 105, targetPct: 136, rewards: rewardBundle(142_000) },
    { id: "reward-110", label: "보상 집중 110", difficulty: 110, targetPct: 150, rewards: rewardBundle(159_000) },
    { id: "reward-115", label: "보상 집중 115", difficulty: 115, targetPct: 165, rewards: rewardBundle(181_000) },
    { id: "reward-120", label: "보상 집중 120", difficulty: 120, targetPct: 180, rewards: rewardBundle(202_000) },
    { id: "two-pool-focused", label: "2풀 집중", difficulty: 110, targetPct: null, rewards: rewardBundle(149_000) },
    { id: "three-pool-mixed", label: "3풀 혼합", difficulty: 110, targetPct: null, rewards: rewardBundle(142_000) },
    { id: "conversion-gold", label: "황금 탐사대", difficulty: 110, targetPct: null, rewards: rewardBundle(154_000, "gold") },
    { id: "conversion-collector", label: "수집가의 길", difficulty: 110, targetPct: null, rewards: rewardBundle(157_000, "collector") },
    { id: "conversion-armory", label: "무구 발굴단", difficulty: 110, targetPct: null, rewards: rewardBundle(155_000, "armory") },
    { id: "focused-trace", label: "집중 추적", difficulty: 110, targetPct: null, rewards: rewardBundle(138_000, "trace") },
  ];
}

const WIN_RATES = {
  95: [0.98, 0.96, 0.93],
  100: [0.97, 0.94, 0.9],
  105: [0.95, 0.92, 0.87],
  110: [0.93, 0.89, 0.83],
  115: [0.9, 0.85, 0.78],
  120: [0.86, 0.81, 0.72],
} as const;

const FIXTURE_IDENTITIES = [
  { id: "vanguard", job: "전위형", build: "물리 방어 · 지속전" },
  { id: "sustain", job: "회복형", build: "마법 방어 · 유지력" },
  { id: "burst", job: "폭딜형", build: "회피 · 단기 화력" },
] as const;

function fixturesForDifficulty(
  difficulty: FixedUnexploredRewardScenario["difficulty"],
): UnexploredRewardFixture[] {
  const depth = (difficulty - 95) / 5;
  return FIXTURE_IDENTITIES.map((identity, index) => ({
    ...identity,
    winRate: WIN_RATES[difficulty][index],
    winBattleSeconds: [22, 27, 17][index] + depth * [1.2, 1.4, 1][index],
    lossBattleSeconds: [31, 36, 25][index] + depth * [1.4, 1.6, 1.2][index],
    winStamina: 10,
    lossStamina: 5,
    hpMpChargeOnWin: [700, 900, 600][index] + depth * 60,
    hpMpChargeOnLoss: [1_500, 1_300, 1_800][index] + depth * 100,
    lossTax: [2_500, 2_000, 3_000][index] + depth * 150,
  }));
}

function benchmarkFixtures(): UnexploredRewardFixture[] {
  return FIXTURE_IDENTITIES.map((identity, index) => ({
    ...identity,
    winRate: [0.99, 0.985, 0.98][index],
    winBattleSeconds: [20, 24, 15][index],
    lossBattleSeconds: [28, 32, 23][index],
    winStamina: 10,
    lossStamina: 5,
    hpMpChargeOnWin: [600, 800, 500][index],
    hpMpChargeOnLoss: [1_200, 1_100, 1_500][index],
    lossTax: [2_000, 1_700, 2_500][index],
  }));
}

export function seededUnexploredRewardRandom(seed: number): () => number {
  let value = Math.floor(nonNegative(seed)) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type FixedUnexploredRewardReportRow = {
  id: string;
  label: string;
  difficulty: number;
  targetPct: number | null;
  rewardIndexPct: number;
  per100StaminaNet: number;
  perHourNet: number;
  stablePlayerCount: number;
  excludedPlayerCount: number;
};

export function runFixedUnexploredRewardSimulation({
  seed,
  runs,
}: {
  seed: number;
  runs: number;
}) {
  const attempts = Math.max(1, Math.floor(nonNegative(runs)));
  const benchmarkRng = seededUnexploredRewardRandom(seed ^ 0x4f1bbcdc);
  const benchmark = summarizeStableUnexploredRewards(
    benchmarkFixtures().map((fixture) =>
      simulateUnexploredRewardFixture({
        fixture,
        rewards: rewardBundle(100_000),
        runs: attempts,
        rng: benchmarkRng,
      }),
    ),
  );
  const rows = fixedUnexploredRewardScenarios().map((scenario, index) => {
    const rng = seededUnexploredRewardRandom(seed + index * 10_007);
    const summary = summarizeStableUnexploredRewards(
      fixturesForDifficulty(scenario.difficulty).map((fixture) =>
        simulateUnexploredRewardFixture({
          fixture,
          rewards: scenario.rewards,
          runs: attempts,
          rng,
        }),
      ),
    );
    return {
      id: scenario.id,
      label: scenario.label,
      difficulty: scenario.difficulty,
      targetPct: scenario.targetPct,
      rewardIndexPct:
        benchmark.per100StaminaNet > 0
          ? (summary.per100StaminaNet / benchmark.per100StaminaNet) * 100
          : 0,
      per100StaminaNet: summary.per100StaminaNet,
      perHourNet: summary.perHourNet,
      stablePlayerCount: summary.stablePlayerCount,
      excludedPlayerCount: summary.excludedPlayerCount,
    } satisfies FixedUnexploredRewardReportRow;
  });
  return {
    seed,
    runs: attempts,
    benchmarkPer100StaminaNet: benchmark.per100StaminaNet,
    rows,
    maxRewardIndexPct: Math.max(...rows.map((row) => row.rewardIndexPct)),
    valuationExcludes: [
      "0.5% 초희귀 고유",
      "미사용 우두머리 핵",
    ] as const,
  };
}
