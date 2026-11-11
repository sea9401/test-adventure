import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdventurerMasteryNotice } from "@/adventure/v2/AdventurerMasteryNotice";

describe("AdventurerMasteryNotice", () => {
  it("모험가에게 직업 숙련도가 쌓이지 않는 이유와 첫 직업 시점을 알린다", () => {
    const html = renderToStaticMarkup(<AdventurerMasteryNotice jobId="none" />);

    expect(html).toContain("모험가는 사냥해도 직업 숙련도가 쌓이지 않습니다");
    expect(html).toContain("레벨 100");
    expect(html).toContain("성장의 신전");
    expect(html).toContain("첫 직업");
  });

  it("직업이 있는 캐릭터에게는 표시하지 않는다", () => {
    expect(renderToStaticMarkup(<AdventurerMasteryNotice jobId="warrior" />)).toBe("");
  });

  it("직업 정보를 아직 모르면 표시하지 않는다", () => {
    expect(renderToStaticMarkup(<AdventurerMasteryNotice jobId={null} />)).toBe("");
  });
});
