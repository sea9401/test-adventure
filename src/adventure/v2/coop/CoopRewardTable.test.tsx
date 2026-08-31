import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { CoopRewardTable } from "./CoopRewardTable";

describe("개인 보스 보상 안내", () => {
  it("확정 재료와 세 고유의 독립 확률을 표시한다", () => {
    const html = renderToStaticMarkup(
      <CoopRewardTable kind={COOP_BOSSES.tracking_weapon} />,
    );

    expect(html).toContain("우두머리 핵");
    expect(html).toContain("연결 특화 재료");
    expect(html).toContain("각각 독립적으로 등장");
    expect(html).toContain("30%");
    expect(html).toContain("10%");
    expect(html).toContain("0.5%");
  });
});
