import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FARM_CROP_REQUIRED_SKILL_ID, emptyFarmState } from "./farm";
import {
  addRanchFeed,
  RANCH_PEN_DEFINITIONS,
  settleRanch,
  unlockRanchPen,
} from "./ranch";
import { confirmRanchPenUpgrade, FarmRanchPanel } from "./FarmRanchPanel";

const HOUR = 60 * 60 * 1000;

describe("farm ranch panel", () => {
  it("모바일에서는 목장 설명과 요약 동작을 서로 다른 행에 배치한다", () => {
    const html = renderToStaticMarkup(
      <FarmRanchPanel
        farm={emptyFarmState(1_000)}
        now={1_000}
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

    expect(html).toContain(
      'class="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-start"',
    );
  });

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

  it("shows the empty pigsty as a four-feed replacement action", () => {
    const base = emptyFarmState(1_000);
    const farm = {
      ...base,
      inventory: { compound_feed: 4 },
      ranch: {
        ...base.ranch,
        pens: {
          ...base.ranch.pens,
          "pigsty-1": {
            ...base.ranch.pens["pigsty-1"],
            unlocked: true,
          },
        },
      },
    };
    const html = renderToStaticMarkup(
      <FarmRanchPanel
        farm={farm}
        now={1_000}
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

    expect(html).toContain("돼지우리");
    expect(html).toContain("비어 있음");
    expect(html).toContain("사료 4개로 새 돼지 데려오기");
    expect(html).toContain("/images/items/farm/pig.webp");
  });

  it("shows the included first pig as fattening immediately after unlock", () => {
    const base = emptyFarmState(1_000);
    const unlockable = {
      ...base.ranch,
      pens: {
        ...base.ranch.pens,
        "coop-2": { ...base.ranch.pens["coop-2"], unlocked: true },
        "cowshed-1": {
          ...base.ranch.pens["cowshed-1"],
          unlocked: true,
        },
        "cowshed-2": {
          ...base.ranch.pens["cowshed-2"],
          unlocked: true,
        },
      },
    };
    const unlocked = unlockRanchPen(unlockable, "pigsty-1", 50, 1_000);
    const html = renderToStaticMarkup(
      <FarmRanchPanel
        farm={{ ...base, ranch: unlocked.ranch }}
        now={1_000}
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

    expect(html).toContain("비육 중");
    expect(html).toContain("16시간");
    expect(html).not.toContain("사료 4개로 새 돼지 데려오기");
  });

  it("shows a finished pig as ready for shipment", () => {
    const base = emptyFarmState(1_000);
    const unlockedRanch = {
      ...base.ranch,
      pens: {
        ...base.ranch.pens,
        "pigsty-1": {
          ...base.ranch.pens["pigsty-1"],
          unlocked: true,
        },
      },
    };
    const now = 1_000 + 16 * HOUR;
    const farm = {
      ...base,
      ranch: settleRanch(
        addRanchFeed(unlockedRanch, "pigsty-1", 4, 1_000),
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

    expect(html).toContain("돼지고기 8개");
    expect(html).toContain("출하 대기");
    expect(html).toContain("모두 수확·출하");
  });
});
