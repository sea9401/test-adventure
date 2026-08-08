import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { battleLogPillColor, BattleLogList } from "./BattleLogList";

describe("방어 기제 로그 라벨", () => {
  it("회피·장벽·방어 라벨을 서로 다른 색상으로 구분한다", () => {
    expect(battleLogPillColor("회피 경감 32.5%")).toContain("teal");
    expect(battleLogPillColor("마력 장벽")).toContain("violet");
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
