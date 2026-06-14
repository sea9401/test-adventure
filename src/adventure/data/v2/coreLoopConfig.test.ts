import { describe, it, expect } from "vitest";
import {
  JOB_GROUP_STAT_GATE,
  SPEC_STAT_GATE,
  isStatGateMet,
  unlockedJobGroups,
  unlockedSpecs,
  V2_CORE_LOOP_V2,
  HUNT_COOLDOWN_MS,
  LOOP_BATTLES_TARGET,
  V2_LEVEL_CAP,
  OFFLINE_MAX_BATTLES,
  coreLoopMaxHpMult,
  ADVENTURER_MAXHP_BONUS_PCT,
  SPEC_TO_GROUP,
  reincarnTargetError,
  OUTPOST_MOVE_GOLD_COST,
  OUTPOST_WARP_GOLD_COST,
  CLAIM_GOLD_COST_BY_TIER,
  combatCooldownRemainingMs,
  lossTaxOf,
  LOSS_TAX_RATE,
  offlineBattlesAccrued,
  OFFLINE_MAX_MS,
} from "./coreLoopConfig";
import { V2_JOB_SPECS } from "./v2JobSpecs";
import { V2_SELECTABLE_CLASSES } from "./classes";

const ALL_SPEC_IDS = Object.values(V2_JOB_SPECS)
  .flat()
  .map((s) => s.id);

describe("coreLoopConfig — 스탯게이트 테이블 동기화", () => {
  it("플래그는 기본 off (미완성 시스템)", () => {
    expect(V2_CORE_LOOP_V2).toBe(false);
  });

  it("선택 가능한 4직군 전부 JOB_GROUP_STAT_GATE 등록", () => {
    for (const c of V2_SELECTABLE_CLASSES) {
      expect(JOB_GROUP_STAT_GATE[c], c).toBeDefined();
    }
    expect(Object.keys(JOB_GROUP_STAT_GATE).sort()).toEqual(
      [...V2_SELECTABLE_CLASSES].sort(),
    );
  });

  it("실재 12계파 전부 SPEC_STAT_GATE 등록 + 고아 키 없음", () => {
    expect(ALL_SPEC_IDS).toHaveLength(12);
    for (const id of ALL_SPEC_IDS) {
      expect(SPEC_STAT_GATE[id], id).toBeDefined();
    }
    expect(Object.keys(SPEC_STAT_GATE).sort()).toEqual([...ALL_SPEC_IDS].sort());
  });

  it("각 게이트는 비어있지 않고 양수 임계", () => {
    for (const gate of [
      ...Object.values(JOB_GROUP_STAT_GATE),
      ...Object.values(SPEC_STAT_GATE),
    ]) {
      const entries = Object.entries(gate);
      expect(entries.length).toBeGreaterThan(0);
      for (const [, min] of entries) expect(min).toBeGreaterThan(0);
    }
  });
});

describe("coreLoopConfig — predicate", () => {
  it("isStatGateMet — 모든 임계 충족 시만 true", () => {
    expect(isStatGateMet({ str: 40, vit: 50 }, { str: 40, vit: 50 })).toBe(true);
    expect(isStatGateMet({ str: 40, vit: 50 }, { str: 40, vit: 49 })).toBe(
      false,
    );
    expect(isStatGateMet({}, {})).toBe(true); // 빈 게이트
    expect(isStatGateMet({ str: 30 }, {})).toBe(false); // 스탯 없음=0
  });

  it("unlockedJobGroups — 주스탯으로 해금", () => {
    expect(unlockedJobGroups({ str: 30 })).toEqual(["warrior"]);
    expect(unlockedJobGroups({ str: 10 })).toEqual([]);
    expect(unlockedJobGroups({ str: 30, int: 30 }).sort()).toEqual([
      "mage",
      "warrior",
    ]);
  });

  it("unlockedSpecs — 복합 조건 충족 계파만", () => {
    // 기사(str40·vit50) 충족이지만 광검(str55·dex25) 미충족.
    const r = unlockedSpecs({ str: 40, vit: 50, dex: 0 });
    expect(r).toContain("knight");
    expect(r).not.toContain("gwang");
    // 아무 스탯 없으면 0.
    expect(unlockedSpecs({})).toEqual([]);
  });
});

describe("coreLoopConfig — 페이싱 다이얼 정합", () => {
  it("5초 × 1200판 ≈ 100분 루프", () => {
    const loopMinutes = (LOOP_BATTLES_TARGET * HUNT_COOLDOWN_MS) / 60000;
    expect(loopMinutes).toBeGreaterThanOrEqual(90);
    expect(loopMinutes).toBeLessThanOrEqual(120);
  });

  it("핵심 다이얼 양수/sane", () => {
    expect(HUNT_COOLDOWN_MS).toBe(5000);
    expect(V2_LEVEL_CAP).toBe(50);
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
  it("이동/워프 비용 양수, 워프 > 이동", () => {
    expect(OUTPOST_MOVE_GOLD_COST).toBeGreaterThan(0);
    expect(OUTPOST_WARP_GOLD_COST).toBeGreaterThan(OUTPOST_MOVE_GOLD_COST);
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

describe("SPEC_TO_GROUP — v2JobSpecs 소속 미러 동기화", () => {
  it("모든 계파가 실제 소속 직군으로 매핑 (고아/오타 없음)", () => {
    for (const [group, specs] of Object.entries(V2_JOB_SPECS)) {
      for (const spec of specs) {
        expect(SPEC_TO_GROUP[spec.id], spec.id).toBe(group);
      }
    }
    // 역방향 — SPEC_TO_GROUP 키 = 실재 12계파 전부.
    expect(Object.keys(SPEC_TO_GROUP).sort()).toEqual([...ALL_SPEC_IDS].sort());
  });
});

describe("reincarnTargetError — 재전직 타겟 게이트 (순수)", () => {
  it("미해금 직군 = job_locked, 해금 직군(스펙 없음) = 통과", () => {
    expect(reincarnTargetError({ str: 10 }, "warrior", null)).toBe("job_locked");
    expect(reincarnTargetError({ str: 30 }, "warrior", null)).toBeNull();
  });

  it("잘못된 타겟(none/미존재) = bad_target", () => {
    expect(reincarnTargetError({ str: 99 }, "none", null)).toBe("bad_target");
    expect(reincarnTargetError({ str: 99 }, "bogus", null)).toBe("bad_target");
  });

  it("계파 스탯 충족 + 소속 일치 = 통과 (기사)", () => {
    // 기사(str40·vit50) — warrior 소속.
    expect(
      reincarnTargetError({ str: 40, vit: 50 }, "warrior", "knight"),
    ).toBeNull();
  });

  it("계파 소속이 타겟 직군과 불일치 = spec_locked", () => {
    // knight 는 warrior 소속인데 mage 로 재전직하며 knight 지정.
    expect(
      reincarnTargetError({ int: 60, str: 40, vit: 50 }, "mage", "knight"),
    ).toBe("spec_locked");
  });

  it("계파 스탯 미충족 = spec_locked (직군은 해금)", () => {
    // warrior 해금(str30)이지만 광검(str55·dex25) 미충족.
    expect(reincarnTargetError({ str: 30 }, "warrior", "gwang")).toBe(
      "spec_locked",
    );
  });

  it("🔑직군 게이트가 계파의 바닥 — yeonhwan(vit 무조건)도 무도가 vit30 없으면 job_locked", () => {
    // 연환 게이트=dex55·str35(vit 없음) → unlockedSpecs 엔 들지만, 무도가(vit30) 미해금이면
    // 재전직 불가. 직군 게이트를 계파와 별개로 확인하는 설계가 load-bearing 임을 못박는다.
    const stats = { dex: 55, str: 35, vit: 0 };
    expect(reincarnTargetError(stats, "martial", "yeonhwan")).toBe("job_locked");
    // vit30 채우면 통과.
    expect(
      reincarnTargetError({ dex: 55, str: 35, vit: 30 }, "martial", "yeonhwan"),
    ).toBeNull();
  });
});

describe("coreLoopMaxHpMult — 모험가 HP 패시브 (flag-gated)", () => {
  it("flag on + 무직(모험가)만 ×(1+보너스)", () => {
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
