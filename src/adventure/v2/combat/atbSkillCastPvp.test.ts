// PR-C — V2_ATB_SKILLS on 일 때 PvP ATB(라이브 아레나) 전투에서 v2 액티브 스킬이 시전되는지.
//   PvP 도 PvE처럼 스킬 시전이 그 행동의 평타를 대체한다. 플래그 off 는
//   combatPvpAtb.test 가 byte-identical 로 커버한다.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import { resolveBattlePvP, type PvPBattleResolution } from "./engine-pvp";
import type { PlayerCombat } from "./engine";

afterEach(() => vi.restoreAllMocks());

const SKILL = "v2c_warrior_flurry"; // 난격 (3타 데미지, procChance 40, mpCost 26)

const caster: PlayerCombat = {
  hp: 400, maxHp: 400, atk: 24, def: 8, spd: 60,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
  maxMp: 100000, mp: 100000, // 사실상 무한 MP — 여러 번 시전 보장
};
const target: PlayerCombat = {
  hp: 4000, maxHp: 4000, atk: 4, def: 8, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
};

function run(): PvPBattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.1); // proc(10<40) 항상 통과 — p1 매 번들 시전
  const res = resolveBattlePvP(caster, target, "P1", "P2", {
    pickAction: () => ({ kind: "attack" }),
    potions: { p1: {}, p2: {} },
    v2Skills: { p1: { learned: [SKILL], equipped: [SKILL] } },
  } as never);
  vi.restoreAllMocks();
  return res;
}

describe("PR-C: V2_ATB_SKILLS on → PvP ATB 스킬 시전", () => {
  it("p1 이 PvP ATB 에서 난격을 시전한다 (라이브 아레나 액티브 활성화)", () => {
    const res = run();
    const p1Casts = res.finalState.log.filter(
      (e) =>
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("난격") &&
        (e as { side?: string }).side === "p1",
    );
    expect(p1Casts.length).toBeGreaterThan(0);
    // 시전 로그도 ATB 틱 t 가 찍혀야 한다(외톨이 박스 방지·tagNewLogEntries 가 cast 뒤에).
    for (const e of p1Casts) {
      expect(typeof (e as { t?: number }).t).toBe("number");
    }
  });

  it("cast XOR 평타 — 매 행동에 스킬이 발동하면 p1 평타가 나가지 않는다", () => {
    const res = run();
    const p1Basic = res.finalState.log.filter(
      (e) =>
        (e as { kind?: string }).kind === "player_attack" &&
        (e as { side?: string }).side === "p1" &&
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("공격!"),
    ).length;
    expect(p1Basic).toBe(0);
  });

  it("수호의 도발은 PvP에서 상대의 다음 행동을 소모하지 않고 즉시 기본 공격 2회를 유도한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const provokeCaster: PlayerCombat = {
      ...caster,
      hp: 1_000,
      maxHp: 1_000,
      thornsDefPct: 200,
      thornsFlatFromDef: 200,
    };
    const res = resolveBattlePvP(provokeCaster, target, "수호자", "상대", {
      pickAction: () => ({ kind: "attack" }),
      potions: { p1: {}, p2: {} },
      v2Skills: {
        p1: {
          learned: ["v2c_warden_aegis"],
          equipped: ["v2c_warden_aegis"],
        },
        p2: {
          learned: ["v2c_warrior_flurry"],
          equipped: ["v2c_warrior_flurry"],
        },
      },
    } as never);
    vi.restoreAllMocks();

    const provokeIndex = res.finalState.log.findIndex(
      (entry) => entry.side === "p1" && entry.text.includes("즉시 기본 공격 2회"),
    );
    expect(provokeIndex).toBeGreaterThanOrEqual(0);
    const provokeTick = res.finalState.log[provokeIndex]?.t;
    const immediateOpponentAttacks = res.finalState.log
      .slice(provokeIndex + 1)
      .filter(
        (entry) =>
          entry.side === "p2" &&
          entry.kind === "player_attack" &&
          entry.t === provokeTick &&
          entry.text.includes("공격!"),
    );
    expect(immediateOpponentAttacks).toHaveLength(2);
    expect(
      res.finalState.log.filter(
        (entry) => entry.t === provokeTick && entry.text.includes("수호 반사"),
      ),
    ).toHaveLength(2);
    expect(
      res.finalState.log.some(
        (entry) =>
          entry.side === "p2" &&
          entry.t !== provokeTick &&
          entry.kind === "player_attack",
      ),
    ).toBe(true);
    expect(
      res.finalState.log.some((entry) => entry.text.includes("스킬 발동률 −100%p")),
    ).toBe(false);
    expect(
      res.finalState.log.some((entry) => entry.text.includes("보호막 +")),
    ).toBe(false);
  });
});
