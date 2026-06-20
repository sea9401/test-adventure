// 절정/무도가 반격 패시브의 PvP 미러 — passiveCounterChancePct 가 PvP 에서도 피격 시 ATK 반격.
//   PvE enemyPhase 카운터와 동일 패턴(maybeApplyMartialCounter). pct 0 = RNG 미소비(byte-identical).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import {
  resolveBattlePvP,
  maybeApplyMartialCounter,
  initialBattleStatePvP,
  type PvPBattleResolution,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";

afterEach(() => vi.restoreAllMocks());

const base: PlayerCombat = {
  hp: 400, maxHp: 400, atk: 40, def: 8, spd: 40,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
};

describe("PvP 반격(maybeApplyMartialCounter) — 유닛", () => {
  it("방어자 passiveCounterChancePct 100 → 공격자가 ATK 반격 피해를 받는다", () => {
    const state = initialBattleStatePvP(
      base, // p1 = 공격자
      { ...base, passiveCounterChancePct: 100 }, // p2 = 방어자(반격 100%)
      "P1", "P2",
    );
    vi.spyOn(Math, "random").mockReturnValue(0); // 100% 확률 통과
    const out = maybeApplyMartialCounter(state, "p1", "p2"); // p1 공격 → p2 반격
    vi.restoreAllMocks();
    type S = { p1: { hp: number }; log: { text?: string }[] };
    expect((out.state as never as S).p1.hp).toBeLessThan(base.hp); // 공격자(p1) HP 감소
    expect(
      (out.state as never as S).log.some((e) => typeof e.text === "string" && e.text.includes("[반격]")),
    ).toBe(true);
  });

  it("passiveCounterChancePct 0 → 무발동(RNG 미소비·byte-identical)", () => {
    const state = initialBattleStatePvP(base, base, "P1", "P2");
    const out = maybeApplyMartialCounter(state, "p1", "p2");
    expect(out.attackerKilled).toBe(false);
    expect(out.state).toBe(state); // 동일 참조 — 아무 변경 없음
  });
});

describe("PvP 반격 — 통합(resolveBattlePvP)", () => {
  it("반격 빌드가 상대를 만나면 전투 로그에 [반격] 이 나타난다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.0001); // 반격 확률 통과
    const res: PvPBattleResolution = resolveBattlePvP(
      { ...base, atk: 10, spd: 20 }, // 약한 공격자
      { ...base, passiveCounterChancePct: 80, spd: 60 }, // 반격 탱
      "공격", "반격가",
      { pickAction: () => ({ kind: "attack" }), potions: { p1: {}, p2: {} } },
    );
    vi.restoreAllMocks();
    const hasCounter = res.finalState.log.some(
      (e) => typeof (e as { text?: string }).text === "string" && (e as { text: string }).text.includes("[반격]"),
    );
    expect(hasCounter).toBe(true);
  });
});
