import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2LoadoutPanel } from "./V2LoadoutPanel";

describe("V2LoadoutPanel 모바일 스킬 동작 영역", () => {
  it("즐겨찾기 옆 동작 버튼의 폭을 고정하고 줄바꿈을 막는다", () => {
    const html = renderToStaticMarkup(
      <V2LoadoutPanel
        loadout={{
          spBudget: 4,
          spUsed: 4,
          equipped: ["v2_skill_strike"],
          library: [
            {
              skillId: "v2_skill_strike",
              name: "강타",
              spCost: 4,
              equipped: true,
            },
            {
              skillId: "v2c_rogue_poison",
              name: "독침",
              spCost: 4,
              equipped: false,
            },
          ],
        }}
      />,
    );

    expect(html.match(/w-\[6\.25rem\]/g)).toHaveLength(2);
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
    expect(html).toContain(">해제<");
    expect(html).toContain(">SP 부족<");
  });
});
