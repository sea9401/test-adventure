import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "../v2/combat/engine";
import { BattleLogList, groupBattleLogActions } from "./BattleLogList";

function cast(name = "성전의 심판", turn: "player" | "enemy" = "player", t = 160, heal = 10753): BattleLogEntry[] {
  const kind = turn === "player" ? "player_attack" : "enemy_attack";
  return [
    { kind: "info", text: "", turn, t, skillCast: { skillId: name === "성전의 심판" ? "v2c_crusader_judgment" : "v2c_templar_smite", skillName: name } },
    { kind, text: `${name}! 339 피해를 입혔다.`, turn, t },
    { kind, text: `${name}! 시전자 HP ${heal} 회복했다.`, turn, t },
    { kind: "info", text: "[패시브 흡혈] 시전자의 HP +13", turn, t },
  ];
}

describe("복합 스킬의 회복 표시", () => {
  for (const name of ["성전의 심판", "심판의 빛"]) {
    it.each(["player", "enemy"] as const)(`${name}의 피해와 회복을 같은 카드에 보존한다 (%s)`, (turn) => {
      const entries = cast(name, turn);
      const items = groupBattleLogActions(entries);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "action", main: entries[1], hits: [entries[1]], effects: [entries[2], entries[3]] });
    });
  }

  it.each([false, true])("반복 시전의 세 회복량이 접힌 상세 밖에 한 번씩 표시된다 (compact=%s)", (compact) => {
    const first = cast("성전의 심판", "player", 80, 6143);
    const entries = [first[0], first[2], ...cast(), ...cast("성전의 심판", "player", 240, 14384)];
    expect(groupBattleLogActions(entries)).toHaveLength(3);
    const html = renderToStaticMarkup(<BattleLogList entries={entries} compact={compact} />);
    const visible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "").replace(/<[^>]+>/g, "");
    for (const amount of [6143, 10753, 14384]) {
      expect(visible.split(`HP ${amount} 회복했다.`)).toHaveLength(2);
    }
  });

  it("다른 틱이나 상대의 회복은 이전 공격에 붙이지 않는다", () => {
    const entries = cast();
    for (const recovery of [{ ...entries[2], t: 240 }, { ...entries[2], kind: "enemy_attack" as const, turn: "enemy" as const }]) {
      expect(groupBattleLogActions([entries[1], recovery])).toHaveLength(2);
    }
  });

  it("틱 없는 과거 로그도 연속된 피해와 회복을 묶는다", () => {
    const entries = cast().map((entry) => ({ ...entry, t: undefined }));
    expect(groupBattleLogActions(entries.slice(1))).toHaveLength(1);
  });

  it("다단 공격의 총 피해와 마나 회복을 구분한다", () => {
    const entries = cast();
    const mana = { ...entries[2], text: "성전의 심판! 시전자 마나 125 회복했다." };
    const items = groupBattleLogActions([entries[0], entries[1], entries[1], entries[2], mana]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ hits: [entries[1], entries[1]], effects: [entries[2], mana] });
  });

  it("다음 시전 경계 뒤의 회복은 별도 행동이다", () => {
    const entries = cast();
    expect(groupBattleLogActions([entries[0], entries[1], entries[0], entries[2]])).toHaveLength(2);
  });
});
