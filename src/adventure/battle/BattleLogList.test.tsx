import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "../v2/combat/engine";
import {
  battleLogPillColor,
  BattleLogList,
  groupBattleLogActions,
} from "./BattleLogList";

const ACTION_LOG: BattleLogEntry[] = [
  {
    kind: "enemy_attack",
    text: "성전의 심판! 24 피해를 입혔다.",
    turn: "enemy",
    t: 10,
  },
  {
    kind: "info",
    text: "성전의 심판! 동키오 HP 1779 회복했다.",
    turn: "enemy",
    t: 10,
  },
  {
    kind: "info",
    text: "[성전의 심판] 받는 피해 -6% (3행동)",
    turn: "enemy",
    t: 10,
  },
  {
    kind: "info",
    text: "[회피 경감 18.4%] 동키오 피해 -673",
    turn: "enemy",
    t: 10,
  },
  {
    kind: "info",
    text: "[받피감] 동키오 피해 -446",
    turn: "enemy",
    t: 10,
  },
  {
    kind: "player_attack",
    text: "[치명타] 만독개화! 1491 피해를 입혔다.",
    turn: "player",
    t: 10,
  },
  {
    kind: "info",
    text: "[만독개화] 동키오 지속/저주 피해 +28% (3행동)",
    turn: "player",
    t: 10,
  },
  {
    kind: "enemy_attack",
    text: "[수호 반사] Allure에게 101 반사 피해.",
    turn: "enemy",
    t: 10,
  },
];

describe("방어 기제 로그 라벨", () => {
  it("회피·장벽·방어 라벨을 서로 다른 색상으로 구분한다", () => {
    expect(battleLogPillColor("회피 경감 32.5%")).toContain("teal");
    expect(battleLogPillColor("마나 실드")).toContain("violet");
    expect(battleLogPillColor("철벽")).toContain("blue");
  });
});

describe("BattleLogList 표시 기호", () => {
  it("치명타 라벨 앞에 별 아이콘을 붙이지 않는다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "화염구! [치명타] 432 피해를 입혔다.",
            turn: "player",
          },
        ]}
      />,
    );

    expect(html).toContain("치명타");
    expect(html).not.toContain("★");
  });

  it("효과 행에 진영 방향에 맞는 하위 표기 기호를 붙인다", () => {
    const playerHtml = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "info",
            text: "[망자의 별] 마나 10 환급",
            turn: "player",
          },
        ]}
      />,
    );
    const enemyHtml = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "info",
            text: "[독무 + 중독] +3스택 (5회)",
            turn: "enemy",
          },
        ]}
      />,
    );

    expect(playerHtml).toContain("└");
    expect(playerHtml).not.toContain("┘");
    expect(enemyHtml).toContain("┘");
    expect(enemyHtml).not.toContain("└");
    expect(`${playerHtml}${enemyHtml}`).not.toMatch(/[ㄴ✦]/);
  });
});

describe("BattleLogList 행동 묶음", () => {
  it("다음 공격 전에 기록된 방어 계산을 그 공격에 연결한다", () => {
    const items = groupBattleLogActions(ACTION_LOG);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: "action",
      main: { text: "성전의 심판! 24 피해를 입혔다." },
      calculations: [],
      effects: [
        { text: "성전의 심판! 동키오 HP 1779 회복했다." },
        { text: "[성전의 심판] 받는 피해 -6% (3행동)" },
      ],
    });
    expect(items[1]).toMatchObject({
      kind: "action",
      main: { text: "[치명타] 만독개화! 1491 피해를 입혔다." },
      calculations: [
        { text: "[회피 경감 18.4%] 동키오 피해 -673" },
        { text: "[받피감] 동키오 피해 -446" },
      ],
      effects: [
        { text: "[만독개화] 동키오 지속/저주 피해 +28% (3행동)" },
        { text: "[수호 반사] Allure에게 101 반사 피해." },
      ],
    });
  });

  it("행동 시작 회복을 직전 상대 공격이 아니라 다음 소유자 행동에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "player_attack",
        text: "공격! 300 피해를 입혔다.",
        turn: "player",
      },
      {
        kind: "info",
        text: "[해연] 동키오의 HP +39",
        turn: "enemy",
      },
      {
        kind: "enemy_attack",
        text: "성전의 심판! 24 피해를 입혔다.",
        turn: "enemy",
      },
    ]);

    expect(items).toMatchObject([
      { kind: "action", effects: [] },
      {
        kind: "action",
        main: { text: "성전의 심판! 24 피해를 입혔다." },
        effects: [{ text: "[해연] 동키오의 HP +39" }],
      },
    ]);
  });

  it("혈마군림 HP 소모를 직전 적 공격이 아니라 다음 사용자 공격에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "enemy_attack",
        text: "기본 공격! 579 피해를 입혔다.",
        turn: "enemy",
      },
      {
        kind: "info",
        text: "혈마군림! 생명력 696 소모",
        turn: "player",
      },
      {
        kind: "player_attack",
        text: "혈마군림! 3090 피해를 입혔다.",
        turn: "player",
      },
    ]);

    expect(items).toMatchObject([
      { kind: "action", effects: [] },
      {
        kind: "action",
        main: { text: "혈마군림! 3090 피해를 입혔다." },
        effects: [{ text: "혈마군림! 생명력 696 소모" }],
      },
    ]);
  });

  it("방어 계산과 본 공격 사이의 보호막 흡수도 같은 행동에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "info",
        text: "[회피 경감 18.4%] 동키오 피해 -673",
        turn: "enemy",
      },
      {
        kind: "info",
        text: "[철벽] 동키오 보호막이 300 흡수 (남은 100)",
        turn: "enemy",
      },
      {
        kind: "player_attack",
        text: "만독개화! 1191 피해를 입혔다.",
        turn: "player",
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        calculations: [
          { text: "[회피 경감 18.4%] 동키오 피해 -673" },
        ],
        effects: [
          { text: "[철벽] 동키오 보호막이 300 흡수 (남은 100)" },
        ],
        main: { text: "만독개화! 1191 피해를 입혔다." },
      },
    ]);
  });

  it("해연 회복은 장비 전체 이름으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "info",
            text: "[해연] 동키오의 HP +39",
            turn: "enemy",
            t: 10,
          },
          {
            kind: "enemy_attack",
            text: "성전의 심판! 24 피해를 입혔다.",
            turn: "enemy",
            t: 10,
          },
        ]}
        playerName="Allure"
        enemyName="동키오"
      />,
    );

    expect(html).toContain("해연추적");
  });

  it("행동 카드에는 주체·최종 결과·효과를 보이고 방어 계산은 상세로 접는다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={ACTION_LOG}
        playerName="Allure"
        enemyName="동키오"
      />,
    );
    const text = html.replace(/<[^>]+>/g, "");

    expect(html.match(/data-battle-action=/g)).toHaveLength(2);
    expect(text).toContain("Allure");
    expect(text).toContain("동키오");
    expect(text).toContain("만독개화");
    expect(text).toContain("1,491 피해");
    expect(text).toContain("지속/저주 피해 +28%");
    expect(text).toContain("동키오의 수호 반사");
    expect(text).toContain("계산 상세");
    expect(html).not.toContain("└");
    expect(html).not.toContain("┘");
  });

  it("방어 계산이 없는 행동에는 상세 펼침을 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "공격! 220 피해를 입혔다.",
            turn: "player",
          },
        ]}
        playerName="Allure"
        enemyName="동키오"
      />,
    );

    expect(html).toContain("기본 공격");
    expect(html).not.toContain("계산 상세");
  });
});
