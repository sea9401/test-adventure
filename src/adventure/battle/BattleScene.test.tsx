import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Monster } from "../data/monsters";
import { initialBattleState } from "../v2/combat/engine";
import {
  actionFrequencyLabel,
  BattleScene,
  BattleStatStrip,
} from "./BattleScene";

describe("전투 속도 표시", () => {
  it("속도를 적 1회당 내 행동 횟수로 바꿔 보여준다", () => {
    expect(actionFrequencyLabel(100, 50)).toMatch(/^적 1회당 내 \d+\.\d회$/);
  });
});

describe("대표 공격력 표시", () => {
  it("지팡이 표시 타입은 실제 물리 평타와 무관하게 마공을 보여준다", () => {
    const html = renderToStaticMarkup(
      <BattleStatStrip
        stats={{
          atk: 68,
          magicAtk: 412,
          def: 169,
          spd: 182,
          primaryAttack: "physical",
          displayAttack: "magic",
        }}
      />,
    );

    expect(html).toContain("마공</span> 412");
    expect(html).not.toContain("공</span> 68");
  });
});

describe("기본 전투 능력치 표시", () => {
  it("마법 방어력을 상세 영역을 열지 않아도 보여준다", () => {
    const html = renderToStaticMarkup(
      <BattleStatStrip
        stats={{
          atk: 548,
          def: 88,
          magicDef: 578,
          spd: 920,
        }}
      />,
    );
    const summary = html.match(/<button[^>]*>([\s\S]*?)<\/button>/)?.[1];

    expect(summary).toContain("마방</span> 578");
    expect(html.match(/마방/g)).toHaveLength(1);
  });
});

describe("전투 결과 표면", () => {
  it("다크 표면 감사 때문에 별도 보상 애니메이션을 추가하지 않는다", () => {
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
      { hp: 100, maxHp: 100, atk: 10, def: 5, spd: 10, evasionPct: 0, attackCount: 1 },
      enemy,
      "검투사",
    );

    const html = renderToStaticMarkup(
      <BattleScene
        state={state}
        playerName="검투사"
        playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
        outcome="win"
      />,
    );

    expect(html).not.toContain("ui-reward-flash");
  });
});

describe("좌우 전투 상태 정렬", () => {
  it("암석 강타를 장착했을 때 현재 중량만 표시한다", () => {
    const enemy: Monster = {
      name: "훈련용 적",
      tags: [],
      hp: 100,
      atk: 10,
      def: 5,
      spd: 5,
      exp: 0,
    };
    const initial = initialBattleState(
      { hp: 100, maxHp: 100, atk: 10, def: 5, spd: 10, evasionPct: 0, attackCount: 1 },
      enemy,
      "변이자",
      {
        learned: ["v2c_golem_rocksmash"],
        equipped: ["v2c_golem_rocksmash"],
      },
    );
    const state = {
      ...initial,
      stacks: { ...initial.stacks, mutationWeight: 2, splitBodies: 3 },
      v2Skills: {
        learned: ["v2c_golem_rocksmash", "v2c_slime_split"],
        equipped: ["v2c_golem_rocksmash", "v2c_slime_split"],
      },
    };

    const visible = renderToStaticMarkup(
      <BattleScene
        state={state as never}
        playerName="변이자"
        playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
        layout="split"
      />,
    );
    expect(visible).toContain("중량 2/3");
    expect(visible).not.toContain("분열체 3/3");

    const hidden = renderToStaticMarkup(
      <BattleScene
        state={{
          ...state,
          v2Skills: {
            learned: ["v2c_golem_tectoniccollapse"],
            equipped: ["v2c_golem_tectoniccollapse"],
          },
        } as never}
        playerName="변이자"
        playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
        layout="split"
      />,
    );
    expect(hidden).not.toContain("중량 2/3");
    expect(hidden).not.toContain("분열체 3/3");
  });

  it("진행 중인 선언의 남은 평타와 현재 기세 단계를 보여준다", () => {
    const enemy: Monster = {
      name: "훈련용 적",
      tags: [],
      hp: 100,
      atk: 10,
      def: 5,
      spd: 5,
      exp: 0,
    };
    const initial = initialBattleState(
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
      "챔피언",
    );
    const state = {
      ...initial,
      duelistBuff: {
        declarationId: "v2c_grandchampion_hour" as const,
        declarationName: "챔피언의 시간",
        chainCount: 4,
        remainingBasicHits: 3,
        basicDamagePct: 15,
        basicCritChancePct: 15,
        basicDefPenetrationPct: 15,
        rampPctPerPriorHit: 5,
        landedBasicHits: 2,
        basicCritMultAdd: 0.25,
        basicCritChanceCap: 95,
      },
    };

    const html = renderToStaticMarkup(
      <BattleScene
        state={state}
        playerName="챔피언"
        playerStatus={{ gender: "male1", exp: 0, maxExp: 100, hpPotionCount: 0 }}
        layout="split"
      />,
    );

    expect(html).toContain("챔피언의 시간");
    expect(html).toContain("남은 평타 3회");
    expect(html).toContain("현재 기세 +10%");
  });

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

    const timedState = {
      ...state,
      log: state.log.map((entry) => ({ ...entry, t: 0 })),
    };
    const html = renderToStaticMarkup(
      <BattleScene
        state={timedState}
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
    expect(html).toContain('data-battle-log-tick-indicator="full"');
    expect(html).toContain('data-battle-log-tick-indicator="compact"');
    expect(html).toContain("0 / 3,000틱");
  });

  it("전용 페이지여도 틱이 없는 레거시 로그에는 시간대를 표시하지 않는다", () => {
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

    expect(html).not.toContain("data-battle-log-tick-indicator");
  });
});
