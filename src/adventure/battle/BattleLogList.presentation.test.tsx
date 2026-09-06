// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BattleLogEntry } from "../v2/combat/engine";
import { BattleLogList, groupBattleLogActions } from "./BattleLogList";

afterEach(cleanup);

const cast: BattleLogEntry = { kind: "info", text: "", turn: "player", t: 100, skillCast: { skillId: "v2c_skyascendant_voidbreak", skillName: "파공" } };
const hit = (damage: number): BattleLogEntry => ({ kind: "player_attack", text: `파공! ${damage} 피해를 입혔다.`, turn: "player", t: 100 });
const entries: BattleLogEntry[] = [
  cast,
  { kind: "player_attack", effect: "extra_damage", text: "[교차·추격] 6499 추가 피해.", turn: "player", t: 100 },
  hit(3472),
  { kind: "info", text: "[교차·추격] 행동 가속 15%", turn: "player", t: 100 },
  hit(3472), hit(3472), hit(5831),
  { kind: "info", text: "[강화] 공격력 +20% (3행동)", turn: "player", t: 100 },
];

describe("승인된 전투 로그 카드", () => {
  it("효과가 끼어도 한 시전의 4타를 한 행동에 유지하고 원본을 수정하지 않는다", () => {
    const original = JSON.stringify(entries);
    const items = groupBattleLogActions(entries);
    expect(items).toHaveLength(1);
    expect(items[0].kind === "action" && items[0].hits).toHaveLength(4);
    expect(JSON.stringify(entries)).toBe(original);
  });

  it("타격과 추격 내역은 접고 총 피해와 지속 효과 배지를 먼저 보여준다", () => {
    render(<BattleLogList entries={entries} playerName="Soo" />);
    expect(screen.getByText("22,746 피해")).toBeTruthy();
    const summary = screen.getByText("타격별 기록 보기");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("1타 3,472 피해");
    expect(details.textContent).toContain("4타 5,831 피해");
    expect(details.textContent).toContain("6,499 추가 피해");
    const badge = screen.getByText(/공격력.*3행동/);
    expect(badge.closest("details")).toBeNull();
    expect(badge.textContent).toContain("공격력 +20% · 3행동");
  });

  it("다음 시전, 다른 틱, 기본 공격, 상대 행동은 연타에 합치지 않는다", () => {
    for (const next of [cast, { ...hit(100), t: 101 }, { kind: "player_attack", text: "공격! 100 피해를 입혔다.", t: 100 } as BattleLogEntry, { kind: "enemy_attack", text: "파공! 100 피해를 입혔다.", t: 100 } as BattleLogEntry]) {
      expect(groupBattleLogActions([...entries, next])).toHaveLength(2);
    }
  });

  it("중간 HP 스냅샷을 숨겨도 별도 시전의 경계는 유지한다", () => {
    const hp: BattleLogEntry = { kind: "hp_bar", text: "", t: 100, playerHp: 100, playerMaxHp: 100, enemyHp: 100, enemyMaxHp: 100 };
    const { container } = render(<BattleLogList entries={[hit(100), hp, hit(200), hp]} />);
    expect(container.querySelectorAll("[data-battle-action]")).toHaveLength(2);
  });

  it("방어 전 추격만 남은 옛 PvP 로그는 부분 피해를 총 피해라고 표시하지 않는다", () => {
    render(<BattleLogList entries={[
      cast,
      { kind: "player_attack", side: "p1", text: "[교차·추격] 6499 추가 피해.", t: 100 },
      hit(100),
    ]} />);
    expect(screen.getByText(/추가 피해 합산 불가/)).toBeTruthy();
    expect(screen.getByText("100 피해").parentElement?.textContent).toBe("기록된 타격 100 피해");
  });

  it("회피는 짧은 제목으로 표시하고 대상 설명을 보존한다", () => {
    const { container } = render(<BattleLogList entries={[{ kind: "enemy_attack", text: "공격! Soo가 공격을 피했습니다." }]} />);
    expect(container.querySelector("[data-battle-headline]")?.textContent).toBe("기본 공격 · 회피");
    expect(screen.getByText("Soo가 공격을 피했습니다.")).toBeTruthy();
  });

  it("효과 전용 회복 시전도 기록된 회복량을 제목에 표시한다", () => {
    const { container } = render(<BattleLogList entries={[
      { kind: "info", text: "", turn: "enemy", skillCast: { skillId: "regen", skillName: "재생" } },
      { kind: "info", text: "[재생] 그림자 기사 HP +3200", turn: "enemy" },
    ]} />);
    expect(container.querySelector("[data-battle-headline]")?.textContent).toBe("재생 · 3,200 회복");
  });
});
