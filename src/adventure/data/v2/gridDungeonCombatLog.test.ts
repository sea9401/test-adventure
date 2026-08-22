import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "@/adventure/v2/combat/engine";
import { gridDungeonSoloCombatLog } from "./gridDungeonCombatLog";

const hit = (
  text: string,
  options: {
    kind?: "player_attack" | "enemy_attack";
    turn?: "player" | "enemy";
    side?: "p1" | "p2";
    t?: number;
  } = {},
): BattleLogEntry => ({
  kind: options.kind ?? "player_attack",
  text,
  turn: options.turn ?? "player",
  ...(options.side ? { side: options.side } : {}),
  ...(options.t == null ? {} : { t: options.t }),
});

describe("gridDungeonSoloCombatLog", () => {
  it("같은 시전의 월식 두 타를 총피해 한 줄로 묶는다", () => {
    expect(
      gridDungeonSoloCombatLog([
        hit("월식! 700 피해를 입혔다.", { t: 80 }),
        hit("월식! 300 피해를 입혔다.", { t: 80 }),
      ]),
    ).toEqual(["월식! 2타 · 총 1,000 피해 (1타 700 / 2타 300)"]);
  });

  it("서로 다른 틱의 연속 월식은 별도 시전으로 유지한다", () => {
    expect(
      gridDungeonSoloCombatLog([
        hit("월식! 700 피해를 입혔다.", { t: 80 }),
        hit("월식! 300 피해를 입혔다.", { t: 120 }),
      ]),
    ).toEqual([
      "월식! 700 피해를 입혔다.",
      "월식! 300 피해를 입혔다.",
    ]);
  });

  it("공격자나 행동 경계가 다른 같은 기술은 합치지 않는다", () => {
    expect(
      gridDungeonSoloCombatLog([
        hit("월식! 400 피해를 입혔다.", { side: "p1", t: 80 }),
        hit("월식! 300 피해를 입혔다.", {
          kind: "enemy_attack",
          turn: "enemy",
          side: "p2",
          t: 80,
        }),
        { kind: "info", text: "행동 경계", turn: "player", t: 80 },
        hit("월식! 200 피해를 입혔다.", { side: "p1", t: 80 }),
      ]),
    ).toEqual([
      "월식! 400 피해를 입혔다.",
      "월식! 300 피해를 입혔다.",
      "행동 경계",
      "월식! 200 피해를 입혔다.",
    ]);
  });

  it("치명타 라벨과 0 피해를 타격별 상세에 보존한다", () => {
    expect(
      gridDungeonSoloCombatLog([
        hit("월식! [치명타] 1,200 피해를 입혔다.", { t: 80 }),
        hit("월식! 0 피해를 입혔다.", { t: 80 }),
      ]),
    ).toEqual([
      "월식! 2타 · 총 1,200 피해 (1타 [치명타] 1,200 / 2타 0)",
    ]);
  });

  it("기본 공격은 합치지 않고 HP 막대 제외 후 최근 행동 제한을 적용한다", () => {
    const hpBar: BattleLogEntry = {
      kind: "hp_bar",
      text: "",
      playerHp: 100,
      playerMaxHp: 100,
      enemyHp: 50,
      enemyMaxHp: 100,
    };
    expect(
      gridDungeonSoloCombatLog(
        [
          { kind: "info", text: "전투 시작" },
          hit("공격! 100 피해를 입혔다."),
          hit("공격! 120 피해를 입혔다."),
          hpBar,
          hit("강타! 200 피해를 입혔다."),
          hit("월식! 300 피해를 입혔다.", { t: 80 }),
          hit("월식! 400 피해를 입혔다.", { t: 80 }),
        ],
        4,
      ),
    ).toEqual([
      "공격! 100 피해를 입혔다.",
      "공격! 120 피해를 입혔다.",
      "강타! 200 피해를 입혔다.",
      "월식! 2타 · 총 700 피해 (1타 300 / 2타 400)",
    ]);
  });
});
