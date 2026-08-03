import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2JobLadder } from "./V2JobLadder";

describe("V2JobLadder production-job guidance", () => {
  it("describes a level-one internal gate as no character-level requirement", () => {
    const html = renderToStaticMarkup(
      <V2JobLadder
        level={42}
        currentJobName="농부"
        currentJobId="farmer"
        atLevelCap
        rejobRequiredLevel={1}
        jobs={[
          {
            id: "horticulturist",
            name: "원예가",
            tier: 3,
            unlocked: false,
            condition: "농부 전직, 농사 Lv 10",
          },
        ]}
        onChanged={() => {}}
      />,
    );

    expect(html).toContain("생산직 전직에는 캐릭터 레벨 제한이 없어요.");
    expect(html).toContain("생활 숙련 조건만 충족하면 바로 전직할 수");
    expect(html).toContain("전직 로드맵");
    expect(html).not.toContain("Lv 1 도달");
  });
});
