import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FishSpecimenSection } from "./FishSpecimenSection";

describe("FishSpecimenSection", () => {
  it("표본 수량과 등록 가능 여부를 불투명 카드에 표시한다", () => {
    const html = renderToStaticMarkup(
      <FishSpecimenSection
        specimens={{ carp: 2, trout: 1 }}
        registeredIds={["trout"]}
        busyFishId={null}
        onUse={() => undefined}
      />,
    );

    expect(html).toContain("잉어 표본");
    expect(html).toContain("송어 표본");
    expect(html).toContain("×2");
    expect(html).toContain("도감 등록");
    expect(html).toContain("이미 등록됨");
    expect(html).toContain("bg-zinc-50");
  });
});
