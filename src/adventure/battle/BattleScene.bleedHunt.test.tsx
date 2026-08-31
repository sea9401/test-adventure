import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Monster } from "@/adventure/data/monsters";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import { makeBleedDot } from "@/adventure/v2/combat/combatShared";
import { initialBattleState, type PlayerCombat } from "@/adventure/v2/combat/engine";
import { BattleScene } from "./BattleScene";

const PLAYER: PlayerCombat = {
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  spd: 10,
  evasionPct: 0,
  attackCount: 1,
};
const ENEMY: Monster = {
  name: "훈련용 적",
  tags: [],
  hp: 100,
  atk: 10,
  def: 5,
  spd: 5,
  exp: 0,
};

function renderBattle({
  stacks,
  equipped = ["v2c_tracker_pounce"],
  layout = "split",
  playerBleedStacks = 0,
}: {
  stacks: number;
  equipped?: V2SkillId[];
  layout?: "stacked" | "split";
  playerBleedStacks?: number;
}) {
  const state = initialBattleState(PLAYER, ENEMY, "수인", {
    learned: equipped,
    equipped,
  });
  return renderToStaticMarkup(
    <BattleScene
      state={{
        ...state,
        enemyV2Dots:
          stacks > 0
            ? [makeBleedDot({ stacks, turns: 3, flatPerStack: 1, sourceAtk: 1 })]
            : [],
        playerV2Dots:
          playerBleedStacks > 0
            ? [
                makeBleedDot({
                  stacks: playerBleedStacks,
                  turns: 3,
                  flatPerStack: 1,
                  sourceAtk: 1,
                }),
              ]
            : [],
      }}
      playerName="수인"
      playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
      layout={layout}
    />,
  );
}

describe("전투 중 출혈 사냥 단계", () => {
  it.each([0, 4])("적 출혈 %i중첩에서는 단계가 보이지 않는다", (stacks) => {
    expect(renderBattle({ stacks })).not.toContain("출혈 사냥");
  });

  it.each([5, 9])("적 출혈 %i중첩에서는 추적을 표시한다", (stacks) => {
    const html = renderBattle({ stacks });
    expect(html).toContain("출혈 사냥 · 추적");
  });

  it("적 출혈 10중첩에서는 사냥의 절정을 표시한다", () => {
    expect(renderBattle({ stacks: 10 })).toContain("출혈 사냥 · 사냥의 절정");
  });

  it("출혈 사냥 스킬을 장착하지 않으면 10중첩이어도 표시하지 않는다", () => {
    expect(
      renderBattle({ stacks: 10, equipped: ["v2c_warrior_strike"] }),
    ).not.toContain("출혈 사냥");
  });

  it.each(["stacked", "split"] as const)("%s 레이아웃에서 단계 라벨을 한 번만 표시한다", (layout) => {
    const html = renderBattle({ stacks: 10, layout });
    expect(html.match(/출혈 사냥 · 사냥의 절정/g)).toHaveLength(1);
  });

  it("플레이어에게 걸린 적 출혈만으로는 사냥 단계를 표시하지 않는다", () => {
    expect(renderBattle({ stacks: 0, playerBleedStacks: 10 })).not.toContain(
      "출혈 사냥",
    );
  });
});
