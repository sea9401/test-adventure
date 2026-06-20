// PR-B — V2_ATB_SKILLS on 일 때 ATB(라이브 PvE) 전투에서 플레이어 v2 액티브 스킬이 시전되는지.
//   플래그 off(기본)는 combatAtb.test 가 byte-identical 로 커버한다(여기선 on 동작만 락).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

const SKILL = "v2c_warrior_flurry"; // 난격 (3타 데미지, procChance 40, mpCost 26)

const player: PlayerCombat = {
  hp: 300, maxHp: 300, atk: 30, def: 6, spd: 30,
  evasionPct: 0, attackCount: 1, accuracyPct: 100,
  maxMp: 100000, mp: 100000, // 사실상 무한 MP — MP 고갈로 평타 폴백되는 경우 배제(XOR 검증용)
};

function run(enemy: Monster, randomValue: number): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(randomValue);
  const res = resolveBattle(player, enemy, "테스터", {
    pickAction: () => ({ kind: "attack" }),
    potions: {},
    v2Skills: { learned: [SKILL], equipped: [SKILL] },
  } as never);
  vi.restoreAllMocks();
  return res;
}

function countText(res: BattleResolution, needle: string): number {
  return res.finalState.log.filter(
    (e) =>
      typeof (e as { text?: string }).text === "string" &&
      (e as { text: string }).text.includes(needle),
  ).length;
}

describe("PR-B: V2_ATB_SKILLS on → ATB 스킬 시전", () => {
  it("난격이 ATB 전투에서 시전된다 (라이브 PvE 액티브 활성화)", () => {
    // 항상 proc(0.1×100=10 < 40) → 매 플레이어 행동이 시전. 적 HP 충분히 커서 여러 번 시전.
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 2000, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1);
    expect(countText(res, "난격")).toBeGreaterThan(0);
  });

  it("cast XOR 평타 — 매 행동이 시전이면 기본 '공격!' 평타가 0건이다", () => {
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 2000, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1); // 항상 proc → 모든 플레이어 행동이 시전(평타 대체)
    const basicAttacks = res.finalState.log.filter(
      (e) =>
        (e as { kind?: string }).kind === "player_attack" &&
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("공격!"),
    ).length;
    expect(basicAttacks).toBe(0);
    expect(countText(res, "난격")).toBeGreaterThan(0);
  });

  it("시전으로 적 처치 시 정상 승리 종료(쓰러뜨렸다 + win)", () => {
    const enemy: Monster = {
      name: "허수아비", tags: [], hp: 120, atk: 4, def: 3, spd: 6, exp: 0, evasionPct: 0,
    };
    const res = run(enemy, 0.1);
    expect(res.outcome).toBe("win");
    // 시전 처치 승리 로그는 ATB 틱 t 가 찍혀야 한다(tagNewLogEntries 가 cast 분기 뒤에 한 번 →
    //   외톨이 박스 방지·Codex PR-B 리뷰 버그#1 회귀 가드).
    const winEntries = res.finalState.log.filter(
      (e) =>
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("쓰러뜨렸다"),
    );
    expect(winEntries.length).toBeGreaterThan(0);
    for (const e of winEntries) {
      expect(typeof (e as { t?: number }).t).toBe("number");
    }
  });
});
