import { describe, it, expect } from "vitest";
import {
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MS,
  LOOP_BATTLES_TARGET,
  V2_LEVEL_CAP,
  OFFLINE_MAX_BATTLES,
  coreLoopMaxHpMult,
  ADVENTURER_MAXHP_BONUS_PCT,
  OUTPOST_MOVE_GOLD_COST,
  CLAIM_GOLD_COST_BY_TIER,
  combatCooldownRemainingMs,
  lossTaxOf,
  LOSS_TAX_RATE,
  offlineBattlesAccrued,
  offlineFarmDepth,
  spendGold,
  spendGoldWith,
  spendableGold,
  spendableGoldWith,
  calcSpBudget,
  spMilestonesForCumLevel,
  spMilestonesCrossed,
  OFFLINE_MAX_MS,
} from "./coreLoopConfig";
describe("coreLoopConfig — 플래그", () => {
  it("플래그는 기본 off (테스트 env 미설정 — 운영은 .env.production 으로 on)", () => {
    expect(V2_CORE_LOOP_V2).toBe(false);
  });
});

describe("coreLoopConfig — 페이싱 다이얼 정합", () => {
  it("5초 × 1200판 ≈ 100분 (50레벨 반각 페이스; 1→100 루프는 ≈2배)", () => {
    const loopMinutes = (LOOP_BATTLES_TARGET * HUNT_COOLDOWN_MS) / 60000;
    expect(loopMinutes).toBeGreaterThanOrEqual(90);
    expect(loopMinutes).toBeLessThanOrEqual(120);
  });

  it("핵심 다이얼 양수/sane", () => {
    expect(HUNT_COOLDOWN_MS).toBe(5000);
    expect(V2_LEVEL_CAP).toBe(100);
    expect(OFFLINE_MAX_BATTLES).toBeGreaterThan(0);
  });
});

describe("combatCooldownRemainingMs — 전투 쿨다운 잔여 (순수)", () => {
  const CD = HUNT_COOLDOWN_MS; // 5000
  const NOW = 1_000_000;

  it("미전투(lastBattleAt=0) = 0 (즉시 가능)", () => {
    expect(combatCooldownRemainingMs(0, NOW)).toBe(0);
  });

  it("방금 전투(lastBattleAt=now) = 풀 쿨다운", () => {
    expect(combatCooldownRemainingMs(NOW, NOW)).toBe(CD);
  });

  it("쿨다운 중 = 남은 ms", () => {
    expect(combatCooldownRemainingMs(NOW - 2000, NOW)).toBe(CD - 2000);
  });

  it("쿨다운 경과(딱 만료 포함) = 0", () => {
    expect(combatCooldownRemainingMs(NOW - CD, NOW)).toBe(0);
    expect(combatCooldownRemainingMs(NOW - CD - 1, NOW)).toBe(0);
  });

  it("🔑미래 lastBattleAt(손상·클락 스큐) = 0 (영구 락아웃 방지·자가치유)", () => {
    expect(combatCooldownRemainingMs(NOW + 1_000_000, NOW)).toBe(0);
    // remaining 이 cooldownMs 를 1ms 라도 넘으면(=미래) 0.
    expect(combatCooldownRemainingMs(NOW + 1, NOW)).toBe(0);
  });

  it("커스텀 cooldownMs(보스 등) 반영", () => {
    expect(combatCooldownRemainingMs(NOW - 3000, NOW, 15000)).toBe(12000);
  });
});

describe("offlineBattlesAccrued — 오프라인 누적 판수 (순수)", () => {
  const CD = HUNT_COOLDOWN_MS; // 5000
  const NOW = 10_000_000_000; // 현실적 타임스탬프(10시간 빼도 양수)

  it("경과 / 쿨다운 (내림)", () => {
    expect(offlineBattlesAccrued(NOW - 60_000, NOW, CD)).toBe(12); // 60s/5s
    expect(offlineBattlesAccrued(NOW - 12_345, NOW, CD)).toBe(2); // floor(12345/5000)
  });

  it("2시간 캡 (OFFLINE_MAX_MS)", () => {
    // 10시간 비웠어도 2시간치(=OFFLINE_MAX_MS/CD)만.
    expect(offlineBattlesAccrued(NOW - 10 * 3600_000, NOW, CD)).toBe(
      OFFLINE_MAX_MS / CD,
    );
    expect(OFFLINE_MAX_MS / CD).toBe(OFFLINE_MAX_BATTLES);
  });

  it("미전투(0/미설정)·미래·음수 경과 = 0", () => {
    expect(offlineBattlesAccrued(0, NOW, CD)).toBe(0);
    expect(offlineBattlesAccrued(NOW + 1000, NOW, CD)).toBe(0); // 미래(손상)
    expect(offlineBattlesAccrued(NOW, NOW, CD)).toBe(0); // 방금 전투
    expect(offlineBattlesAccrued(NaN, NOW, CD)).toBe(0);
  });
});

describe("offlineFarmDepth — 자동 사냥 farm 깊이 (순수, 잠긴 깊이 클램프)", () => {
  it("lastHuntDepth 있으면 그 값(프론티어 내 클램프)", () => {
    expect(offlineFarmDepth(3, 5)).toBe(3);
    expect(offlineFarmDepth(5, 5)).toBe(5); // 프론티어와 동일 허용
    expect(offlineFarmDepth(9, 5)).toBe(5); // 프론티어 초과 → 클램프
    expect(offlineFarmDepth(0, 5)).toBe(4); // <1 → 폴백(frontier−1)
  });
  it("없으면 frontier−1 (단 최소 1)", () => {
    expect(offlineFarmDepth(null, 5)).toBe(4);
    expect(offlineFarmDepth(undefined, 2)).toBe(1);
    expect(offlineFarmDepth(NaN, 2)).toBe(1);
  });
  it("프론티어 손상값이어도 최소 2로 보정 → 깊이 ≥1", () => {
    expect(offlineFarmDepth(undefined, 0)).toBe(1); // frontier→2, 2−1=1
    expect(offlineFarmDepth(1, 0)).toBe(1);
  });
});

describe("spendGoldWith — bankFirst=false (현행 prod, 보유만)", () => {
  it("보유 충분 → 보유만 차감, 은행 불변", () => {
    expect(spendGoldWith(100, 500, 30, false)).toEqual({
      ok: true,
      gold: 70,
      bankedGold: 500,
    });
  });
  it("보유 부족 → 은행이 많아도 ok:false (출금/은행소비 없음)", () => {
    expect(spendGoldWith(10, 500, 30, false)).toEqual({
      ok: false,
      gold: 10,
      bankedGold: 500,
    });
  });
});

describe("spendGoldWith — bankFirst=true (코어루프, 은행 우선)", () => {
  it("은행으로 전액 충당 → 보유 불변", () => {
    expect(spendGoldWith(100, 500, 300, true)).toEqual({
      ok: true,
      gold: 100,
      bankedGold: 200,
    });
  });
  it("은행 소진 후 모자란 만큼 보유에서", () => {
    expect(spendGoldWith(100, 500, 600, true)).toEqual({
      ok: true,
      gold: 0,
      bankedGold: 0,
    });
  });
  it("은행 일부 + 보유 일부", () => {
    expect(spendGoldWith(100, 50, 120, true)).toEqual({
      ok: true,
      gold: 30,
      bankedGold: 0,
    });
  });
  it("총합 부족 → ok:false, 잔액 불변", () => {
    expect(spendGoldWith(100, 50, 200, true)).toEqual({
      ok: false,
      gold: 100,
      bankedGold: 50,
    });
  });
  it("손상 입력(NaN/음수) 방어", () => {
    expect(spendGoldWith(NaN, 50, 30, true)).toEqual({
      ok: true,
      gold: 0,
      bankedGold: 20,
    });
    expect(spendGoldWith(-5, -5, 0, true)).toEqual({
      ok: true,
      gold: 0,
      bankedGold: 0,
    });
  });
});

describe("spendableGoldWith / 래퍼 — 지불가능 총액", () => {
  it("bankFirst=true → 보유+은행", () => {
    expect(spendableGoldWith(100, 500, true)).toBe(600);
  });
  it("bankFirst=false → 보유만", () => {
    expect(spendableGoldWith(100, 500, false)).toBe(100);
  });
  it("flag 래퍼(spendGold/spendableGold)는 실제 flag(테스트=off) 적용 = 보유만", () => {
    expect(spendableGold(100, 500)).toBe(100);
    expect(spendGold(10, 500, 30).ok).toBe(false); // off → 은행 무시
  });
});

describe("spMilestonesForCumLevel — 점감(widening) 마일스톤 곡선", () => {
  it("점감 임계 — n번째 SP 누적 숙련도(a45 d25, 해금 스케일 ×9): 405/1035/1890/2970/4275/5805/7560/9540", () => {
    // 임계 직전엔 n-1, 임계 도달 시 n.
    const T = [405, 1035, 1890, 2970, 4275, 5805, 7560, 9540];
    T.forEach((thresh, i) => {
      expect(spMilestonesForCumLevel(thresh - 1), `${thresh}-1`).toBe(i);
      expect(spMilestonesForCumLevel(thresh), `${thresh}`).toBe(i + 1);
    });
  });
  it("간격이 뒤로 갈수록 넓어진다 (점감 — flat 아님)", () => {
    // 1→2 간격 70, 2→3 간격 95, 3→4 간격 120 … 단조 증가.
    const gaps = [115 - 45, 210 - 115, 330 - 210, 475 - 330];
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    }
  });
  it("첫 SP 전(cum<45)·0·손상 입력(음수·NaN·Infinity) = 0", () => {
    expect(spMilestonesForCumLevel(0)).toBe(0);
    expect(spMilestonesForCumLevel(269)).toBe(0);
    expect(spMilestonesForCumLevel(-50)).toBe(0);
    expect(spMilestonesForCumLevel(NaN)).toBe(0);
    expect(spMilestonesForCumLevel(Infinity)).toBe(0);
  });
  it("매우 큰 cumLevel 도 유한 정수 반환(천장은 calcSpBudget 캡이 담당)", () => {
    const v = spMilestonesForCumLevel(10_000_000);
    expect(Number.isFinite(v)).toBe(true);
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("spMilestonesCrossed — 레벨업 시 새로 넘은 SP 마일스톤(알림용)", () => {
  it("임계를 넘지 않은 레벨업 = 0", () => {
    expect(spMilestonesCrossed(405, 450)).toBe(0); // 둘 다 1번째 구간
    expect(spMilestonesCrossed(2619, 2628)).toBe(0); // 베테랑(이미 3) — 새 임계 없음
  });
  it("임계 1개 넘기면 1", () => {
    expect(spMilestonesCrossed(1026, 1035)).toBe(1); // 2번째 임계 도달
    expect(spMilestonesCrossed(396, 405)).toBe(1); // 첫 SP
  });
  it("한 번에 여러 임계 넘기면 그 수만큼(다중 레벨업)", () => {
    // 0 → 1890: 임계 405·1035·1890 세 개 통과 = 3.
    expect(spMilestonesCrossed(0, 1890)).toBe(3);
  });
  it("cumLevel 단조 — 역행/동일은 0(음수 방지)", () => {
    expect(spMilestonesCrossed(300, 100)).toBe(0);
    expect(spMilestonesCrossed(115, 115)).toBe(0);
  });
});

describe("calcSpBudget — 스킬포인트 예산 (점감 마일스톤)", () => {
  it("빈 직업군 = SP_BASE(12)", () => {
    expect(calcSpBudget({})).toBe(12);
    expect(calcSpBudget(null)).toBe(12);
  });
  it("직업군 cumLevel 점감 마일스톤 합산", () => {
    expect(calcSpBudget({ warrior: { cumLevel: 1035 } })).toBe(14); // 12 + 2
    expect(
      calcSpBudget({ warrior: { cumLevel: 1890 }, mage: { cumLevel: 405 } }),
    ).toBe(16); // 12 + 3 + 1
  });
  it("정복(balanceCumLevel≥250) 직업군당 +3 — tier 무관(환생 flatten 영향 없음)", () => {
    // cumLevel 2250 = 정복 → 마일스톤(2250→3) + base12 + 정복3 = 18.
    expect(calcSpBudget({ warrior: { cumLevel: 2250 } })).toBe(18);
    // 임계 직전(2249) = 미정복 → 정복 보너스 없음(마일스톤 3 만).
    expect(calcSpBudget({ warrior: { cumLevel: 2249 } })).toBe(15);
    // tier 4 라도 cumLevel 낮으면 미정복 — 차수 기반 아님(코어루프 flatten 무관).
    expect(calcSpBudget({ warrior: { cumLevel: 405, tier: 4 } })).toBe(13); // 12+1
  });
  it("운영 실측 베테랑 — 마이그 후 top(cum6372·4직업·3정복)은 점감으로 ~32, flat43 대비 천장 굳음", () => {
    // 실제 user8 마이그 후: warrior2619·rogue2619·mage2619·martial1701 / 밸런스 입력 291·291·291·189.
    const sp = calcSpBudget({
      warrior: { cumLevel: 2619, tier: 4 },
      rogue: { cumLevel: 2619, tier: 4 },
      mage: { cumLevel: 2619, tier: 4 },
      martial: { cumLevel: 1701, tier: 3 },
    });
    // balance 291→3 마일스톤 ×3 = 9, 189→2 = 2 → 11 마일스톤 + base12 + 3정복×3=9 → 32.
    expect(sp).toBe(32);
  });
  it("소프트캡 40", () => {
    expect(calcSpBudget({ a: { cumLevel: 100000, tier: 4 } })).toBe(40);
  });
  it("손상 입력 방어", () => {
    expect(calcSpBudget({ a: { cumLevel: NaN as unknown as number } })).toBe(12);
  });
});

describe("lossTaxOf — 패배 세금 (순수, 보유 한도 클램프)", () => {
  it("정상 — atRiskGold 의 절반(LOSS_TAX_RATE)", () => {
    expect(lossTaxOf(100_000, 100_000)).toEqual({
      tax: 50_000,
      nextHeld: 50_000,
    });
    expect(LOSS_TAX_RATE).toBe(0.5);
  });

  it("🔑보유 < atRiskGold (승리 후 소비·토벌 압류) = 보유 한도로 클램프(마이너스 방지)", () => {
    // atRisk 10만인데 보유 3만뿐 → 세금은 보유의 절반(1.5만), 보유 -50% 1.5만.
    expect(lossTaxOf(100_000, 30_000)).toEqual({ tax: 15_000, nextHeld: 15_000 });
    // 보유 0(토벌로 전액 압류) → 세금 0, 마이너스 없음.
    expect(lossTaxOf(100_000, 0)).toEqual({ tax: 0, nextHeld: 0 });
  });

  it("atRiskGold 0(최근 승리 없음) = 세금 0", () => {
    expect(lossTaxOf(0, 100_000)).toEqual({ tax: 0, nextHeld: 100_000 });
  });

  it("음수/NaN/비정상 입력 방어 + 내림", () => {
    expect(lossTaxOf(-5, 100)).toEqual({ tax: 0, nextHeld: 100 });
    expect(lossTaxOf(100, -5)).toEqual({ tax: 0, nextHeld: 0 });
    expect(lossTaxOf(101, 101).tax).toBe(50); // floor(50.5)
    // NaN(손상 세이브) → 0, 전파 없음.
    expect(lossTaxOf(NaN, 100)).toEqual({ tax: 0, nextHeld: 100 });
    expect(lossTaxOf(100, NaN)).toEqual({ tax: 0, nextHeld: 0 });
    expect(lossTaxOf(Infinity, 100)).toEqual({ tax: 0, nextHeld: 100 });
  });

  it("rate 커스텀", () => {
    expect(lossTaxOf(100_000, 100_000, 0.25).tax).toBe(25_000);
  });
});

describe("coreLoopConfig — 거점 행동 골드 비용 (스태미나 대체)", () => {
  it("이동 비용 양수", () => {
    expect(OUTPOST_MOVE_GOLD_COST).toBeGreaterThan(0);
  });

  it("점령 비용 4티어 전부 등록 + 티어 오름차순(상위 거점일수록 비쌈)", () => {
    const tiers = [1, 2, 3, 4];
    for (const t of tiers) {
      expect(CLAIM_GOLD_COST_BY_TIER[t], `tier ${t}`).toBeGreaterThan(0);
    }
    for (let i = 1; i < tiers.length; i++) {
      expect(CLAIM_GOLD_COST_BY_TIER[tiers[i]]).toBeGreaterThan(
        CLAIM_GOLD_COST_BY_TIER[tiers[i - 1]],
      );
    }
  });
});

describe("coreLoopMaxHpMult — 모험가 HP 패시브 (flag-gated)", () => {
  it("코어루프 on + 무직(모험가)만 ×(1+보너스)", () => {
    expect(coreLoopMaxHpMult("none", true)).toBeCloseTo(
      1 + ADVENTURER_MAXHP_BONUS_PCT / 100,
    );
  });
  it("flag off 면 무직이어도 ×1.0 (전투 무변경)", () => {
    expect(coreLoopMaxHpMult("none", false)).toBe(1);
  });
  it("다른 직업은 flag 무관 ×1.0", () => {
    expect(coreLoopMaxHpMult("warrior", true)).toBe(1);
    expect(coreLoopMaxHpMult("mage", true)).toBe(1);
  });
});
