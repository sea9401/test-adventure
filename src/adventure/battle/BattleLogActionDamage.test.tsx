import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BattleLogEntry } from "../v2/combat/engine";
import { BattleLogList } from "./BattleLogList";

function render(entries: BattleLogEntry[], compact = false) {
  const html = renderToStaticMarkup(<BattleLogList entries={entries} compact={compact} playerName="류하린" enemyName="성해의 파수꾼" />);
  const details = [...html.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/g)].map(([detail]) => detail).join("");
  return {
    html,
    details: details.replace(/<[^>]+>/g, ""),
    outside: html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "").replace(/<[^>]+>/g, ""),
  };
}
const main: BattleLogEntry = { kind: "player_attack", text: "[치명타] 혈흔 가르기! 62754 피해를 입혔다.", turn: "player", t: 120 };
const pursuit: BattleLogEntry = { kind: "info", text: "[추적 사격] 37652 추가 피해", effect: "extra_damage", turn: "player", t: 120 };

describe("행동 총 피해와 계산 상세", () => {
  it.each([false, true])("혈흔 가르기와 추적 사격은 상단 합계와 상세 구성으로 표시한다 (compact=%s)", (compact) => {
    const { outside, details } = render([
      { kind: "info", text: "[회피 경감 0.8%] 성해의 파수꾼 피해 -517", turn: "player", t: 120 },
      main,
      { kind: "info", text: "출혈 지속이 4회로 갱신됐다.", turn: "player", t: 120 },
      pursuit,
    ], compact);
    expect(outside).toContain("총 100,406 피해");
    expect(outside).toContain("출혈 지속이 4회로 갱신됐다.");
    expect(outside).not.toContain("추적 사격");
    expect(details).toContain("혈흔 가르기62,754 피해");
    expect(details).toContain("추적 사격37,652 피해");
    expect(details).toContain("방어 계산");
    expect(details).toContain("517");
  });

  it("방어 계산이 없어도 추가 피해의 계산 상세를 제공한다", () => {
    const { outside, details } = render([main, pursuit]);
    expect(outside).toContain("총 100,406 피해");
    expect(details).toContain("피해 구성");
    expect(details).not.toContain("방어 계산");
  });

  it("여러 번 발생한 같은 추가 효과는 합치고 다른 효과는 나눠 표시한다", () => {
    const { outside, details } = render([
      main, pursuit, { ...pursuit, text: "[추적 사격] 100 추가 피해" },
      { ...pursuit, text: "[그림자 잔상] 200 추가 피해" },
      { ...pursuit, text: "[과부하 낙뢰] 300 마법 피해" },
    ]);
    expect(outside).toContain("총 101,006 피해");
    expect(details).toContain("추적 사격37,752 피해");
    expect(details).toContain("그림자 잔상200 피해");
    expect(details).toContain("과부하 낙뢰300 피해");
  });

  it("상대 행동도 같은 기준으로 합산한다", () => {
    const { outside, details } = render([
      { ...main, kind: "enemy_attack", turn: "enemy" },
      { ...pursuit, turn: "enemy" },
    ]);
    expect(outside).toContain("상대 행동");
    expect(outside).toContain("총 100,406 피해");
    expect(details).toContain("추적 사격37,652 피해");
  });

  it("다단 스킬 본 피해에 추가 피해를 한 번만 더한다", () => {
    const { outside, details } = render([
      { ...main, text: "혈흔 가르기! 100 피해를 입혔다." },
      { ...main, text: "혈흔 가르기! 200 피해를 입혔다." },
      { ...pursuit, text: "[추적 사격] 60 추가 피해" },
    ]);
    expect(outside).toContain("2타 · 총 360 피해");
    expect(details).toContain("혈흔 가르기300 피해");
    expect(details).toContain("추적 사격60 피해");
  });

  it("지속 피해·반대편 추가 피해·다른 시각·방어 및 버프 수치는 총합에 넣지 않는다", () => {
    const { outside } = render([
      { kind: "info", text: "[출혈] 류하린이 출혈로 92 피해를 입었다.", effect: "status_damage", turn: "player", t: 120 },
      main, pursuit,
      { ...pursuit, text: "[반격] 300 추가 피해", turn: "enemy" },
      { ...pursuit, text: "[추적 사격] 400 추가 피해", t: 121 },
      { kind: "info", text: "[공격 증가] 추가 피해 +20%", effect: "status", turn: "player", t: 120 },
    ]);
    expect(outside).toContain("총 100,406 피해");
    expect(outside).toContain("300 추가 피해");
    expect(outside).toContain("400 추가 피해");
    expect(outside).toContain("92");
    expect(outside).toContain("20%");
  });

  it("옛 PvE 추적 사격과 별도로 기록된 교차·추격을 합산한다", () => {
    const { outside, details } = render([
      main, { ...pursuit, effect: undefined },
      { kind: "player_attack", text: "[교차·추격] 100 추가 피해.", turn: "player", t: 120 },
    ]);
    expect(outside).toContain("총 100,506 피해");
    expect(details).toContain("교차·추격100 피해");
    expect(details).toContain("추적 사격37,652 피해");
  });

  it("추가 피해가 없는 일반 공격에는 새 상세를 만들지 않는다", () => {
    const { outside, details } = render([main]);
    expect(outside).toContain("62,754 피해");
    expect(details).toBe("");
  });
});
