import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FARM_CROP_REQUIRED_SKILL_ID, emptyFarmState } from "./farm";
import { addRanchFeed, RANCH_PEN_DEFINITIONS, settleRanch } from "./ranch";
import { confirmRanchPenUpgrade, FarmRanchPanel } from "./FarmRanchPanel";

const HOUR = 60 * 60 * 1000;

describe("farm ranch panel", () => {
  it("축사 열기 확인을 취소하면 해금 요청을 실행하지 않는다", () => {
    const onUpgrade = vi.fn();
    const confirm = vi.fn(() => false);

    expect(
      confirmRanchPenUpgrade({
        definition: RANCH_PEN_DEFINITIONS[2],
        confirm,
        onUpgrade,
      }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("농장 증표 60개"),
    );
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it("shows ready products, feed capacity, locked costs, and workshop navigation", () => {
    const now = 1_000 + 12 * HOUR;
    const base = emptyFarmState(1_000);
    const farm = {
      ...base,
      ranch: settleRanch(
        addRanchFeed(base.ranch, "coop-1", 6, 1_000),
        now,
      ),
    };
    const html = renderToStaticMarkup(
      <FarmRanchPanel
        farm={farm}
        now={now}
        learnedSkillIds={[FARM_CROP_REQUIRED_SKILL_ID]}
        busyFeedPenId={null}
        busyCollect={false}
        busyUpgradePenId={null}
        onFeed={vi.fn()}
        onCollect={vi.fn()}
        onUpgrade={vi.fn()}
        onOpenLifeWorkshop={vi.fn()}
      />,
    );

    expect(html).toContain("목장");
    expect(html).toContain("닭");
    expect(html).toContain("달걀 12개");
    expect(html).toContain("사료 0 / 6");
    expect(html).toContain("모두 수확");
    expect(html).toContain("생활 제작으로 이동");
    expect(html).toContain("농사 Lv.20");
    expect(html).toContain("농장 증표 60개");
    expect(html).toContain("/images/items/farm/chicken.webp");
  });

  it("keeps the starter coop unavailable until seed selection is learned", () => {
    const html = renderToStaticMarkup(
      <FarmRanchPanel
        farm={emptyFarmState(1_000)}
        now={1_000}
        learnedSkillIds={[]}
        busyFeedPenId={null}
        busyCollect={false}
        busyUpgradePenId={null}
        onFeed={vi.fn()}
        onCollect={vi.fn()}
        onUpgrade={vi.fn()}
        onOpenLifeWorkshop={vi.fn()}
      />,
    );

    expect(html).toContain("씨앗 선별을 배우면 목장이 열립니다");
    expect(html).not.toContain("사료 넣기");
  });
});
