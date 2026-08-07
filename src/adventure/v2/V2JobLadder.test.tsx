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
        revisitExpedited={false}
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

  it("allows leaving a revisited combat job immediately but not repeating that job", () => {
    const html = renderToStaticMarkup(
      <V2JobLadder
        level={1}
        currentJobName="병사"
        currentJobId="warrior"
        atLevelCap
        revisitExpedited
        rejobRequiredLevel={100}
        jobs={[
          {
            id: "warrior",
            name: "병사",
            tier: 1,
            unlocked: true,
            condition: "기본 직업",
          },
          {
            id: "mage",
            name: "마법사",
            tier: 1,
            unlocked: true,
            condition: "기본 직업",
          },
        ]}
        onChanged={() => {}}
      />,
    );

    expect(html).toContain("이전에 수련한 직업이라 전직 레벨 제한이 없어요.");
    expect(html).toContain("놓친 스킬을 배운 뒤 바로 다른 직업으로 이동할 수");
    expect(html).not.toContain("생산직 전직에는 캐릭터 레벨 제한이 없어요.");
    expect(html).toContain("Lv 100 필요");
  });
});
