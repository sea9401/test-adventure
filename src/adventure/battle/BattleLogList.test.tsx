import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "../v2/combat/engine";
import {
  battleLogPillColor,
  BattleLogList,
  battleLogGroupFirstTick,
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
    expect(battleLogPillColor("마나 실드 파괴")).toContain("violet");
    expect(battleLogPillColor("철벽")).toContain("blue");
  });
});

describe("BattleLogList 표시 기호", () => {
  it("묶음에서 처음 기록된 ATB 틱을 반환한다", () => {
    expect(
      battleLogGroupFirstTick([
        { kind: "info", text: "전투 시작" },
        { kind: "player_attack", text: "공격", t: 420 },
        { kind: "info", text: "효과", t: 425 },
      ]),
    ).toBe(420);
  });

  it("ATB 로그 묶음은 첫 틱을 스크롤 추적 메타데이터로 노출한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          { kind: "info", text: "전투 시작" },
          { kind: "player_attack", text: "공격", t: 420 },
          { kind: "info", text: "효과", t: 425 },
        ]}
      />,
    );

    expect(html).toContain('data-battle-log-group-tick="420"');
  });

  it("틱이 없는 레거시 묶음은 DOM에 시간대 메타데이터를 노출하지 않는다", () => {
    const entries: BattleLogEntry[] = [{ kind: "info", text: "옛 로그" }];

    expect(battleLogGroupFirstTick(entries)).toBeNull();
    expect(renderToStaticMarkup(<BattleLogList entries={entries} />)).not.toContain(
      "data-battle-log-group-tick",
    );
  });

  it("모바일에서는 일반·compact 보조 정보를 12px 이상으로 표시한다", () => {
    const entries: BattleLogEntry[] = [
      { kind: "turn_marker", text: "1턴 · AP 0", turn: "player" },
      {
        kind: "player_attack",
        text: "[치명타] 공격! 220 피해를 입혔다.",
        turn: "player",
      },
      {
        kind: "hp_bar",
        text: "",
        playerHp: 540,
        playerMaxHp: 600,
        enemyHp: 380,
        enemyMaxHp: 600,
      },
    ];

    const normalHtml = renderToStaticMarkup(
      <BattleLogList entries={entries} />,
    );
    const compactHtml = renderToStaticMarkup(
      <BattleLogList entries={entries} compact />,
    );

    expect(normalHtml).toContain(
      'data-battle-log-metadata="turn-marker"',
    );
    expect(normalHtml).toContain('data-battle-log-metadata="hp-bar"');
    expect(normalHtml).toContain("text-xs sm:text-[10px]");
    expect(compactHtml).toContain("text-xs sm:text-[9px]");
    expect(compactHtml).toContain("text-xs sm:text-[10px]");
  });

  it("긴 행동명과 결과를 모바일에서 잘라내지 않는 반응형 행동 카드를 렌더한다", () => {
    // Break caught: the 70%-wide, single-row card lets the nowrap result
    // collapse and truncate a long skill title on narrow phones.
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "[치명타] 개벽·오원소 회귀! 4557 피해를 입혔다.",
            turn: "player",
            t: 10,
          },
          {
            kind: "info",
            text: "개벽·오원소 회귀! 플루디아 마나 451 회복했다.",
            turn: "player",
            t: 10,
          },
        ]}
        playerName="플루디아"
        enemyName="훈련용 적"
      />,
    );

    expect(html).toContain("개벽·오원소 회귀");
    expect(html).toContain("w-full sm:w-[70%]");
    expect(html).toContain(
      "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(html).toContain("break-words sm:truncate");
    expect(html).toContain(
      "whitespace-normal break-words sm:whitespace-nowrap",
    );
  });

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
  const MULTI_HIT_LOG: BattleLogEntry[] = [
    {
      kind: "player_attack",
      text: "천궁궤적! 100 피해를 입혔다.",
      turn: "player",
      t: 120,
    },
    {
      kind: "player_attack",
      text: "천궁궤적! 200 피해를 입혔다.",
      turn: "player",
      t: 120,
    },
    {
      kind: "player_attack",
      text: "천궁궤적! 300 피해를 입혔다.",
      turn: "player",
      t: 120,
    },
    {
      kind: "info",
      text: "[천궁궤적] 받는 피해 +18% (3행동)",
      turn: "player",
      t: 120,
    },
  ];

  it("같은 시각에 이어진 동일 기술의 연타를 한 행동으로 묶는다", () => {
    const items = groupBattleLogActions(MULTI_HIT_LOG);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "action",
      main: { text: "천궁궤적! 100 피해를 입혔다." },
      hits: [
        { text: "천궁궤적! 100 피해를 입혔다." },
        { text: "천궁궤적! 200 피해를 입혔다." },
        { text: "천궁궤적! 300 피해를 입혔다." },
      ],
      effects: [{ text: "[천궁궤적] 받는 피해 +18% (3행동)" }],
    });
  });

  it("행동 시작 지속 피해가 있어도 동일 기술의 연타를 한 행동으로 묶는다", () => {
    const items = groupBattleLogActions([
      {
        kind: "info",
        text: "[중독] 춘삼이(가) 중독으로 92 피해를 입었다.",
        turn: "player",
        effect: "status_damage",
        t: 800,
      },
      {
        kind: "info",
        text: "[회피 경감 28.1%] 레히인 피해 -3979",
        turn: "player",
        t: 800,
      },
      {
        kind: "info",
        text: "[받피감] 레히인 피해 -1322",
        turn: "player",
        t: 800,
      },
      {
        kind: "player_attack",
        text: "월식! 1088 피해를 입혔다.",
        turn: "player",
        t: 800,
      },
      {
        kind: "player_attack",
        text: "월식! 0 피해를 입혔다.",
        turn: "player",
        t: 800,
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "action",
      main: { text: "월식! 1088 피해를 입혔다." },
      hits: [
        { text: "월식! 1088 피해를 입혔다." },
        { text: "월식! 0 피해를 입혔다." },
      ],
      effects: [
        { text: "[중독] 춘삼이(가) 중독으로 92 피해를 입었다." },
      ],
      calculations: [
        { text: "[회피 경감 28.1%] 레히인 피해 -3979" },
        { text: "[받피감] 레히인 피해 -1322" },
      ],
    });
  });

  it("연타 카드에 총피해와 각 타격 피해를 바로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList entries={MULTI_HIT_LOG} playerName="궁수" />,
    );

    expect(html).toContain("3타");
    expect(html).toContain("총 600 피해");
    expect(html).toContain("1타 100");
    expect(html).toContain("2타 200");
    expect(html).toContain("3타 300");
  });

  it("다른 시각에 시전한 동일 기술은 별도 행동으로 유지한다", () => {
    const items = groupBattleLogActions([
      MULTI_HIT_LOG[0],
      { ...MULTI_HIT_LOG[1], t: 121 },
    ]);

    expect(items).toHaveLength(2);
    expect(items).toMatchObject([
      { kind: "action", main: { t: 120 } },
      { kind: "action", main: { t: 121 } },
    ]);
  });

  it("같은 시각의 기본 공격은 연속되어도 각각의 행동으로 유지한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "player_attack",
        text: "공격! 100 피해를 입혔다.",
        turn: "player",
        t: 120,
      },
      {
        kind: "player_attack",
        text: "공격! 120 피해를 입혔다.",
        turn: "player",
        t: 120,
      },
    ]);

    expect(items).toHaveLength(2);
  });

  it("행동 시작 상태 피해를 직전 공격이 아니라 피해자의 다음 행동에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "player_attack",
        text: "공격! 120 피해를 입혔다.",
        turn: "player",
      },
      {
        kind: "info",
        effect: "status_damage",
        text: "뇌정 성역지기이(가) 중독으로 2145 피해를 입었다.",
        turn: "enemy",
      },
      {
        kind: "enemy_attack",
        text: "공격! 50 피해를 입혔다.",
        turn: "enemy",
      },
    ]);

    expect(items).toMatchObject([
      { kind: "action", effects: [] },
      {
        kind: "action",
        main: { turn: "enemy" },
        effects: [{ effect: "status_damage", turn: "enemy" }],
      },
    ]);
  });

  it("상태 피해로 행동 전에 쓰러지면 상태 피해와 사망을 독립 로그로 남긴다", () => {
    const items = groupBattleLogActions([
      {
        kind: "player_attack",
        text: "공격! 120 피해를 입혔다.",
        turn: "player",
      },
      {
        kind: "info",
        effect: "status_damage",
        text: "뇌정 성역지기이(가) 중독으로 2145 피해를 입었다.",
        turn: "enemy",
      },
      {
        kind: "info",
        text: "뇌정 성역지기을(를) 쓰러뜨렸다!",
        turn: "enemy",
      },
    ]);

    expect(items).toMatchObject([
      { kind: "action", effects: [] },
      { kind: "entry", entry: { effect: "status_damage" } },
      {
        kind: "entry",
        entry: { text: "뇌정 성역지기을(를) 쓰러뜨렸다!" },
      },
    ]);
  });

  it("옛 치명타 기본 공격을 다음 사람 행동의 효과로 합치지 않는다", () => {
    const entries: BattleLogEntry[] = [
      {
        kind: "enemy_attack",
        text: "[치명타] 738 피해를 입혔다.",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "info",
        text: "[칼바람 낙인] 혈향에게 표식을 남겼다. (방어 18% 감소, 2행동)",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "player_attack",
        text: "공격! 85 피해를 입혔다.",
        turn: "player",
        t: 10,
      },
    ];

    const items = groupBattleLogActions(entries);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: { text: "[치명타] 738 피해를 입혔다." },
        effects: [
          {
            text: "[칼바람 낙인] 혈향에게 표식을 남겼다. (방어 18% 감소, 2행동)",
          },
        ],
      },
      {
        kind: "action",
        main: { text: "공격! 85 피해를 입혔다." },
        effects: [],
      },
    ]);
  });

  it("옛 그림자 도약 효과 로그도 다음 공격과 분리된 행동으로 복원한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "info",
        text: "[그림자 도약] Soo이(가) 다음 공격 1회를 반드시 회피한다.",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "player_attack",
        text: "공격! 85 피해를 입혔다.",
        turn: "player",
        t: 10,
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: {
          kind: "enemy_attack",
          text: "그림자 도약! 확정 회피를 준비했다.",
        },
        effects: [
          {
            text: "[그림자 도약] Soo이(가) 다음 공격 1회를 반드시 회피한다.",
          },
        ],
      },
      {
        kind: "action",
        main: { text: "공격! 85 피해를 입혔다." },
      },
    ]);
  });

  it("새 그림자 도약 행동과 효과 로그는 하나의 행동 카드로 묶는다", () => {
    const items = groupBattleLogActions([
      {
        kind: "enemy_attack",
        text: "그림자 도약! 확정 회피를 준비했다.",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "info",
        text: "[그림자 도약] Soo이(가) 다음 공격 1회를 반드시 회피한다.",
        turn: "enemy",
        t: 10,
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: { text: "그림자 도약! 확정 회피를 준비했다." },
        effects: [
          {
            text: "[그림자 도약] Soo이(가) 다음 공격 1회를 반드시 회피한다.",
          },
        ],
      },
    ]);
    expect(items).toHaveLength(1);
  });

  it("상대의 그림자 도약으로 회피된 내 공격은 내 행동 카드로 분리한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "enemy_attack",
        text: "그림자 도약! 확정 회피를 준비했다.",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "info",
        text: "[그림자 도약] 춘삼이(가) 다음 공격 1회를 반드시 회피한다.",
        turn: "enemy",
        t: 10,
      },
      {
        kind: "info",
        text: "[회피 강화] 춘삼이(가) 공격을 회피했다.",
        turn: "player",
        t: 20,
      },
      {
        kind: "info",
        text: "[흑월지배] 춘삼의 다음 직접 피해 스킬 치명타 준비.",
        turn: "enemy",
        t: 20,
      },
      {
        kind: "enemy_attack",
        text: "월식! 120 피해를 입혔다.",
        turn: "enemy",
        t: 30,
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: { kind: "enemy_attack", text: "그림자 도약! 확정 회피를 준비했다." },
        effects: [
          { text: "[그림자 도약] 춘삼이(가) 다음 공격 1회를 반드시 회피한다." },
        ],
      },
      {
        kind: "action",
        main: {
          kind: "player_attack",
          text: "[회피 강화] 춘삼이(가) 공격을 회피했다.",
        },
        effects: [
          { text: "[흑월지배] 춘삼의 다음 직접 피해 스킬 치명타 준비." },
        ],
      },
      {
        kind: "action",
        main: { kind: "enemy_attack", text: "월식! 120 피해를 입혔다." },
      },
    ]);
  });

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

  it("선행 계산 로그가 없어도 철벽 흡수를 암월난무 행동에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "info",
        text: "[철벽] 상대 보호막이 300 흡수 (남은 100)",
        turn: "player",
      },
      {
        kind: "player_attack",
        text: "암월난무! 296 피해를 입혔다.",
        turn: "player",
        t: 10,
      },
      {
        kind: "player_attack",
        text: "암월난무! 266 피해를 입혔다.",
        turn: "player",
        t: 10,
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: { text: "암월난무! 296 피해를 입혔다." },
        hits: [
          { text: "암월난무! 296 피해를 입혔다." },
          { text: "암월난무! 266 피해를 입혔다." },
        ],
        effects: [
          { text: "[철벽] 상대 보호막이 300 흡수 (남은 100)" },
        ],
      },
    ]);
  });

  it("마나 실드 전개와 차단을 암월난무 행동에 연결한다", () => {
    const items = groupBattleLogActions([
      {
        kind: "info",
        text: "[마나 실드] 상대 내구도 500 전개",
        turn: "enemy",
      },
      {
        kind: "info",
        text: "[마나 실드] 피해 450 차단 (내구도 50/500)",
        turn: "player",
      },
      {
        kind: "player_attack",
        text: "암월난무! 296 피해를 입혔다.",
        turn: "player",
      },
    ]);

    expect(items).toMatchObject([
      {
        kind: "action",
        main: { text: "암월난무! 296 피해를 입혔다." },
        effects: [
          { text: "[마나 실드] 상대 내구도 500 전개" },
          { text: "[마나 실드] 피해 450 차단 (내구도 50/500)" },
        ],
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
    expect(text).toContain("내 행동");
    expect(text).toContain("상대 행동");
    expect(text).toContain("상대가 받음");
    expect(text).toContain("내가 받음");
    expect(text).toContain("만독개화");
    expect(text).toContain("1,491 피해");
    expect(text).toContain("지속/저주 피해 +28%");
    expect(text).toContain("동키오의 수호 반사");
    expect(text).toContain("계산 상세");
    expect(html).not.toContain("└");
    expect(html).not.toContain("┘");
  });

  it("중간 HP 표시를 접어도 연속된 서로 다른 행동을 독립 카드로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "그림자 도약! 확정 회피를 준비했다.",
            turn: "player",
            t: 0,
          },
          {
            kind: "info",
            text: "[그림자 도약] 다음 공격 1회를 반드시 회피한다.",
            turn: "player",
            t: 0,
          },
          {
            kind: "hp_bar",
            text: "",
            playerHp: 1_000,
            playerMaxHp: 1_000,
            enemyHp: 1_000,
            enemyMaxHp: 1_000,
            t: 0,
          },
          {
            kind: "enemy_attack",
            text: "철벽 태세! 철벽 반사 3회 준비",
            turn: "enemy",
            t: 0,
          },
          {
            kind: "hp_bar",
            text: "",
            playerHp: 1_000,
            playerMaxHp: 1_000,
            enemyHp: 1_000,
            enemyMaxHp: 1_000,
            t: 0,
          },
        ]}
        playerName="혈향"
        enemyName="상대"
      />,
    );

    expect(html.match(/data-battle-action=/g)).toHaveLength(2);
    expect(html).toContain("그림자 도약");
    expect(html).toContain("철벽 태세");
  });

  it("상대 행동은 결과를 먼저, 행동 주체와 행동명을 오른쪽에 배치한다", () => {
    const playerHtml = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "기본 공격! 12 피해를 입혔다.",
            turn: "player",
          },
        ]}
        playerName="플루디아"
        enemyName="풍력핵 골렘"
      />,
    );
    const enemyHtml = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "enemy_attack",
            text: "[치명타] 기본 공격! 12 피해를 입혔다.",
            turn: "enemy",
          },
        ]}
        playerName="플루디아"
        enemyName="풍력핵 골렘"
      />,
    );

    expect(playerHtml.indexOf("기본 공격")).toBeLessThan(
      playerHtml.indexOf("12 피해"),
    );
    expect(enemyHtml.indexOf("12 피해")).toBeLessThan(
      enemyHtml.indexOf("기본 공격"),
    );
    expect(enemyHtml).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(enemyHtml).toContain("justify-start");
    expect(enemyHtml).toContain("justify-end text-right");
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

  it("스킬로 강제된 기본 공격은 원인 스킬을 행동명에 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "player_attack",
            text: "공격! 3 피해를 입혔다.",
            turn: "player",
            forcedBySkill: "수호의 도발",
          },
        ]}
        playerName="또또미"
        enemyName="IVE유진"
      />,
    );

    expect(html).toContain("수호의 도발 강제 공격");
    expect(html).not.toContain("기본 공격");
  });

  it("HP 스냅샷에 6T 시그니처 자원을 양쪽 관점으로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
            playerSignatureResources: {
              gravityReprisal: 105,
              pursuitMarks: 4,
              dominant: "pursuit",
            },
            enemySignatureResources: { arcaneOverload: 75 },
          },
        ]}
      />,
    );

    expect(html).toContain("중력 105");
    expect(html).toContain("추적 4");
    expect(html).toContain("지배 추적");
    expect(html).toContain("과부하 75");
  });

  it("법칙 각인 스냅샷이 있을 때만 총합과 종류별 개수를 한 줄로 표시한다", () => {
    const withInscription = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
            playerSignatureResources: {
              lawInscriptions: "4/8 · 공격 2 · 환류 2",
            },
          },
        ]}
      />,
    );
    expect(withInscription).toContain("각인 4/8 · 공격 2 · 환류 2");

    const legacy = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
          },
        ]}
      />,
    );
    expect(legacy).not.toContain("각인 ");
  });

  it("대상의 한기 스냅샷을 중복 표기 없이 표시하고 예전 로그는 그대로 읽는다", () => {
    const chilled = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
            enemySignatureResources: { frostChill: "한기 3/5" },
          },
        ]}
      />,
    );
    expect(chilled.match(/한기 3\/5/g)).toHaveLength(2);
    expect(chilled).not.toContain("한기 한기");

    const legacy = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
          },
        ]}
      />,
    );
    expect(legacy).not.toContain("한기");
  });

  it("적 자원 스냅샷의 추적 위협을 한글 라벨로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[{
          kind: "hp_bar",
          text: "",
          playerHp: 900,
          playerMaxHp: 1_000,
          enemyHp: 800,
          enemyMaxHp: 1_000,
          enemySignatureResources: { trackingThreat: "73/100" },
        }]}
      />,
    );

    expect(html).toContain("추적 위협 73/100");
    expect(html).not.toContain("trackingThreat");
  });

  it("적 자원 스냅샷의 독혈과 회복 억제를 한글 라벨로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[{
          kind: "hp_bar",
          text: "",
          playerHp: 900,
          playerMaxHp: 1_000,
          enemyHp: 800,
          enemyMaxHp: 1_000,
          enemySignatureResources: {
            toxicBlood: "7/10",
            toxicRecoveryLock: "2/2",
          },
        }]}
      />,
    );

    expect(html).toContain("독혈 7/10");
    expect(html).toContain("회복 억제 2/2");
    expect(html).not.toContain("toxicBlood");
    expect(html).not.toContain("toxicRecoveryLock");
  });

  it("빙하 거수의 한기와 빙결 자원을 한글 라벨로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
            enemySignatureResources: {
              glacialChill: "7/10",
              glacialFreeze: "1/1",
            },
          },
        ]}
      />,
    );

    expect(html).toContain("한기 7/10");
    expect(html).toContain("빙결 1/1");
    expect(html).not.toContain("glacialChill");
    expect(html).not.toContain("glacialFreeze");
  });

  it("HP 스냅샷에 삼중 결계 잔량과 영역 안정을 밝음·소모 상태로 표시한다", () => {
    const html = renderToStaticMarkup(
      <BattleLogList
        entries={[
          {
            kind: "hp_bar",
            text: "",
            playerHp: 900,
            playerMaxHp: 1_000,
            enemyHp: 800,
            enemyMaxHp: 1_000,
            playerSignatureResources: {
              physicalWard: 2,
              magicWard: 1,
              purificationWard: 0,
              domainStability: 3,
            },
          },
        ]}
      />,
    );

    expect(html).toContain('aria-label="금강결계 2"');
    expect(html).toContain('aria-label="봉마결계 1"');
    expect(html).toContain('aria-label="정화결계 0"');
    expect(html).toContain('aria-label="영역 안정 3"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
  });
});
