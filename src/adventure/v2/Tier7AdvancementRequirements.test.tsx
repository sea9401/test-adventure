import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { tier7AdvancementStatus } from "@/adventure/data/v2/tier7Advancement";
import {
  Tier7AdvancementRequirements,
  Tier7FirstUnlockNotice,
} from "./Tier7AdvancementRequirements";

const candidateStatus = tier7AdvancementStatus({
  targetJobId: "shadowblade",
  currentJobId: "swordsaint",
  currentLevel: 100,
  jobCumLevel: { swordsaint: 99_999, blackmoon: 100_000 },
  jobHistory: [],
  materials: { v2_storm_origin_fragment: 29 },
})!;
const readyStatus = tier7AdvancementStatus({
  targetJobId: "shadowblade",
  currentJobId: "swordsaint",
  currentLevel: 100,
  jobCumLevel: { swordsaint: 100_000, blackmoon: 100_000 },
  jobHistory: [],
  materials: { v2_storm_origin_fragment: 30 },
})!;
const permanentStatus = tier7AdvancementStatus({
  targetJobId: "shadowblade",
  currentJobId: "warrior",
  currentLevel: 1,
  jobCumLevel: {},
  jobHistory: ["shadowblade"],
  materials: {},
})!;

describe("Tier7AdvancementRequirements", () => {
  it("shows the five first-unlock requirements with current progress", () => {
    const html = renderToStaticMarkup(
      <Tier7AdvancementRequirements status={candidateStatus} />,
    );

    expect(html).toContain("검성 숙련도");
    expect(html).toContain("99,999 / 100,000");
    expect(html).toContain("흑월 숙련도");
    expect(html).toContain("100,000 / 100,000");
    expect(html).toContain("현재 직업");
    expect(html).toContain("검성 또는 흑월");
    expect(html).toContain("현재 레벨");
    expect(html).toContain("100 / 100");
    expect(html).toContain("폭풍 기원의 파편");
    expect(html).toContain("29 / 30");
  });

  it("replaces first-unlock progress with a permanent-unlock badge", () => {
    const html = renderToStaticMarkup(
      <Tier7AdvancementRequirements status={permanentStatus} />,
    );

    expect(html).toContain("영구 해금");
    expect(html).not.toContain("폭풍 기원의 파편");
  });

  it("warns that only the first advancement consumes 30 fragments", () => {
    const html = renderToStaticMarkup(
      <Tier7FirstUnlockNotice status={readyStatus} />,
    );

    expect(html).toContain("폭풍 기원의 파편 30개");
    expect(html).toContain("최초 전직에만");
    expect(html).toContain("Lv.1");
    expect(html).toContain("숙련도와 배운 스킬은 유지");
  });

  it("does not show a first-unlock warning for a permanent revisit", () => {
    expect(
      renderToStaticMarkup(
        <Tier7FirstUnlockNotice status={permanentStatus} />,
      ),
    ).toBe("");
  });
});
