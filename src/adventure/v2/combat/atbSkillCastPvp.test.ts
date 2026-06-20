// PR-C — V2_ATB_SKILLS on 일 때 PvP ATB(라이브 아레나) 전투에서 v2 액티브 스킬이 시전되는지.
//   PvP 는 cast + 평타(XOR 아님) — 시전해도 그 턴 평타는 그대로 난다. 플래그 off 는
//   combatPvpAtb.test 가 byte-identical 로 커버.
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

  it("cast + 평타(XOR 아님) — 시전 턴에도 p1 평타가 난다", () => {
    const res = run();
    const p1Basic = res.finalState.log.filter(
      (e) =>
        (e as { kind?: string }).kind === "player_attack" &&
        (e as { side?: string }).side === "p1" &&
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("공격!"),
    ).length;
    expect(p1Basic).toBeGreaterThan(0);
  });
});
