import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompactBattlePlayerStatus } from "./CompactBattlePlayerStatus";

describe("접힌 사냥터 캐릭터 정보", () => {
  it("상세 정보를 열지 않아도 HP·MP 충전약 잔량을 보여준다", () => {
    const html = renderToStaticMarkup(
      <CompactBattlePlayerStatus
        name="모험가"
        hp={{ hp: 120, maxHp: 200 }}
        mp={{ mp: 30, maxMp: 50 }}
        exp={40}
        maxExp={100}
        hpCharges={17}
        mpCharges={9}
      >
        <div>펼친 상세 정보</div>
      </CompactBattlePlayerStatus>,
    );

    const summary = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];

    expect(summary).toContain("HP 충전약 17");
    expect(summary).toContain("MP 충전약 9");
  });
});
