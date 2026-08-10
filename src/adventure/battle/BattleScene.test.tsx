import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Monster } from "../data/monsters";
import { initialBattleState } from "../v2/combat/engine";
import { actionFrequencyLabel, BattleScene } from "./BattleScene";

describe("전투 속도 표시", () => {
  it("속도를 적 1회당 내 행동 횟수로 바꿔 보여준다", () => {
    expect(actionFrequencyLabel(100, 50)).toMatch(/^적 1회당 내 \d+\.\d회$/);
  });
});

describe("좌우 전투 상태 정렬", () => {
  it("플레이어 부제가 있으면 적 쪽에도 같은 높이의 빈 줄을 둔다", () => {
    const enemy: Monster = {
      name: "훈련용 적",
      tags: [],
      hp: 100,
      atk: 10,
      def: 5,
      spd: 5,
      exp: 0,
    };
    const state = initialBattleState(
      {
        hp: 100,
        maxHp: 100,
        atk: 10,
        def: 5,
        spd: 10,
        evasionPct: 0,
        attackCount: 1,
      },
      enemy,
      "모험가",
    );

    const html = renderToStaticMarkup(
      <BattleScene
        state={state}
        playerName="모험가"
        playerStatus={{
          gender: "male1",
          exp: 0,
          maxExp: 100,
          hpPotionCount: 0,
        }}
        layout="split"
        playerSubtitle="Lv.100 · 검사"
      />,
    );

    expect(html).toContain("Lv.100 · 검사");
    expect(html).toContain(
      'class="-mt-1 select-none truncate text-center text-[11px] text-transparent"',
    );
  });

  it("전용 페이지에서는 로그를 내부 스크롤 없이 끝까지 펼친다", () => {
    const enemy: Monster = {
      name: "훈련용 적",
      tags: [],
      hp: 100,
      atk: 10,
      def: 5,
      spd: 5,
      exp: 0,
    };
    const state = initialBattleState(
      {
        hp: 100,
        maxHp: 100,
        atk: 10,
        def: 5,
        spd: 10,
        evasionPct: 0,
        attackCount: 1,
      },
      enemy,
      "모험가",
    );

    const html = renderToStaticMarkup(
      <BattleScene
        state={state}
        playerName="모험가"
        playerStatus={{
          gender: "male1",
          exp: 0,
          maxExp: 100,
          hpPotionCount: 0,
        }}
        layout="split"
        logViewport="page"
      />,
    );

    expect(html).toContain('data-battle-log-viewport="page"');
    expect(html).not.toContain("h-[58svh]");
    expect(html).not.toContain("overflow-y-auto");
  });
});
