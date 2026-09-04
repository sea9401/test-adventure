import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  SKILL_DETAIL_BODY_CLASS,
  SKILL_DETAIL_OVERLAY_CLASS,
  SKILL_DETAIL_PANEL_CLASS,
  SkillDetailContent,
  SkillDetailTrigger,
} from "./SkillDetailDialog";

describe("SkillDetailDialog", () => {
  it("renders the detail heading, summary, facts and sections", () => {
    const html = renderToStaticMarkup(
      <SkillDetailContent skillId="v2c_hegemon_annihilation" />,
    );

    expect(html).toContain("멸왕일도");
    expect(html).toContain("공격력×2");
    expect(html).toContain("SP ");
    expect(html.indexOf("작동 방식")).toBeLessThan(html.indexOf("연계"));
    expect(html.indexOf("연계")).toBeLessThan(html.indexOf("제약"));
    expect(html.indexOf("제약")).toBeLessThan(html.indexOf("PvP 차이"));
  });

  it("exports a responsive internally scrolling opaque surface contract", () => {
    expect(SKILL_DETAIL_OVERLAY_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["items-end", "sm:items-center", "sm:p-4"]),
    );
    expect(SKILL_DETAIL_PANEL_CLASS.split(" ")).toEqual(
      expect.arrayContaining([
        "max-h-[calc(100dvh-1rem)]",
        "w-full",
        "max-w-2xl",
        "overflow-hidden",
        ...SURFACE_CARD.split(" "),
      ]),
    );
    expect(SKILL_DETAIL_PANEL_CLASS).toContain("bg-white");
    expect(SKILL_DETAIL_PANEL_CLASS).toContain("dark:bg-zinc-900");
    expect(SKILL_DETAIL_PANEL_CLASS).not.toMatch(/\bbg-\S+\/\d+/);
    expect(SKILL_DETAIL_BODY_CLASS.split(" ")).toContain("overflow-y-auto");
  });

  it("gives every trigger a discoverable accessible name", () => {
    const html = renderToStaticMarkup(
      <SkillDetailTrigger
        skillId="v2_skill_strike"
        skillName="강타"
        onOpen={vi.fn()}
      >
        <span>강타</span>
      </SkillDetailTrigger>,
    );

    expect(html).toContain('aria-label="강타 상세 보기"');
  });

  it("does not warn about unknown content outside development", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const html = renderToStaticMarkup(
        <SkillDetailContent skillId={"missing_skill" as V2SkillId} />,
      );

      expect(html).toBe("");
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
