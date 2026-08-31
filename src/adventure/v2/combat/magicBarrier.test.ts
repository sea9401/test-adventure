import { describe, expect, it } from "vitest";
import {
  magicBarrierCombatLogEntries,
  resolveMagicBarrierDamage,
} from "./magicBarrier";

describe("마나 실드 피해 채널 해석", () => {
  it("방어 전 피해를 나눈 뒤 몸통 채널에만 기존 경감을 적용한다", () => {
    let receivedBodyRaw = -1;
    const result = resolveMagicBarrierDamage({
      rawDamage: 1_000,
      durability: 1_500,
      absorbPct: 25,
      efficiencyPct: 20,
      eligible: true,
      mitigateBody: (bodyRaw) => {
        receivedBodyRaw = bodyRaw;
        return Math.floor(bodyRaw * 0.5);
      },
    });

    expect(receivedBodyRaw).toBe(750);
    expect(result).toEqual({
      bodyRawDamage: 750,
      mitigatedBodyDamage: 375,
      absorbedDamage: 250,
      spillDamage: 0,
      hpBoundDamage: 375,
      durabilitySpent: 200,
      durabilityLeft: 1_300,
      destroyed: false,
    });
  });

  it("부족한 내구도에서 넘친 마나 채널 피해는 몸통 경감을 받지 않는다", () => {
    expect(
      resolveMagicBarrierDamage({
        rawDamage: 1_000,
        durability: 50,
        absorbPct: 25,
        efficiencyPct: 20,
        eligible: true,
        mitigateBody: (bodyRaw) => Math.floor(bodyRaw * 0.5),
      }),
    ).toMatchObject({
      mitigatedBodyDamage: 375,
      absorbedDamage: 62,
      spillDamage: 188,
      hpBoundDamage: 563,
      durabilitySpent: 50,
      durabilityLeft: 0,
      destroyed: true,
    });
  });

  it("제외 피해와 구형 스냅샷은 장벽을 쓰지 않고 기존 몸통 계산만 수행한다", () => {
    const excluded = resolveMagicBarrierDamage({
      rawDamage: 1_000,
      durability: 1_500,
      absorbPct: 25,
      efficiencyPct: 20,
      eligible: false,
      mitigateBody: (raw) => raw - 200,
    });
    const legacy = resolveMagicBarrierDamage({
      rawDamage: 1_000,
      durability: 1_500,
      eligible: true,
      mitigateBody: (raw) => raw - 200,
    });

    expect(excluded).toEqual({
      bodyRawDamage: 1_000,
      mitigatedBodyDamage: 800,
      absorbedDamage: 0,
      spillDamage: 0,
      hpBoundDamage: 800,
      durabilitySpent: 0,
      durabilityLeft: 1_500,
      destroyed: false,
    });
    expect(legacy).toEqual(excluded);
  });

  it("차단 피해와 내구도 소모를 구분하고 파괴 전환을 한 번만 알린다", () => {
    const active = resolveMagicBarrierDamage({
      rawDamage: 1_000,
      durability: 1_500,
      absorbPct: 25,
      efficiencyPct: 20,
      eligible: true,
      mitigateBody: (raw) => raw,
    });
    expect(magicBarrierCombatLogEntries(active)).toEqual([
      {
        kind: "info",
        text: "[마나 실드] 피해 250 차단 · 내구도 200 소모 (남은 1,300)",
      },
    ]);

    const destroyed = resolveMagicBarrierDamage({
      rawDamage: 1_000,
      durability: 50,
      absorbPct: 25,
      efficiencyPct: 20,
      eligible: true,
      mitigateBody: (raw) => raw,
    });
    expect(magicBarrierCombatLogEntries(destroyed)).toEqual([
      {
        kind: "info",
        text: "[마나 실드] 피해 62 차단 · 내구도 50 소모 (남은 0)",
      },
      {
        kind: "info",
        text: "[마나 실드 파괴] 내구도가 모두 소진되었다.",
      },
    ]);
    expect(
      magicBarrierCombatLogEntries({
        ...destroyed,
        absorbedDamage: 0,
        durabilitySpent: 0,
        destroyed: false,
      }),
    ).toEqual([]);
  });
});
