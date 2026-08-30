import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  emptyFarmState,
  farmingLevelXpThreshold,
  type FarmState,
} from "./farm";
import { addRanchFeed, settleRanch, unlockRanchSlot } from "./ranch";
import {
  FarmRanchPanel,
  confirmRanchRebuild,
  confirmRanchSlotConstruction,
} from "./FarmRanchPanel";

const HOUR = 60 * 60 * 1000;

const handlers = {
  onFeed: vi.fn(),
  onCollect: vi.fn(),
  onUpgrade: vi.fn(),
  onRebuild: vi.fn(),
  onOpenLifeWorkshop: vi.fn(),
};

function renderRanch(farm: FarmState, now = 1_000, learned = true) {
  return renderToStaticMarkup(
    <FarmRanchPanel
      farm={farm}
      now={now}
      learnedSkillIds={learned ? [FARM_CROP_REQUIRED_SKILL_ID] : []}
      busyFeedSlotId={null}
      busyCollect={false}
      busyUpgradeSlotId={null}
      busyRebuildSlotId={null}
      {...handlers}
    />,
  );
}

describe("farm ranch panel", () => {
  it("모바일에서는 목장 설명과 요약 동작을 서로 다른 행에 배치한다", () => {
    const html = renderRanch(emptyFarmState(1_000));

    expect(html).toContain(
      'class="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-start"',
    );
  });

  it("건설 확인을 취소하면 선택한 축사 해금 요청을 실행하지 않는다", async () => {
    const onUpgrade = vi.fn();
    const confirm = vi.fn(async () => false);

    expect(
      await confirmRanchSlotConstruction({
        slotId: "slot-3",
        animalId: "cow",
        costReputation: 60,
        confirm,
        onUpgrade,
      }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("부지 3에 외양간"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("농장 증표 60개"));
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it("10개 부지를 표시하고 다음 부지에만 세 축사 건설 선택을 노출한다", () => {
    const html = renderRanch(emptyFarmState(1_000));

    expect(html).toContain("보유 부지 1 / 10");
    expect(html.match(/>부지 \d+</g)).toHaveLength(10);
    expect(html).toContain("닭장 건설");
    expect(html).toContain("외양간 건설");
    expect(html).toContain("돼지우리 건설");
    expect(html).toContain("부지 농사 Lv.10 필요 · 외양간 농사 Lv.20 필요");
    expect(html).toContain("부지 농사 Lv.10 필요 · 돼지우리 농사 Lv.50 필요");
    expect(html.match(/앞 부지를 먼저 열어야 합니다/g)).toHaveLength(8);
    expect(html).toContain("다음 부지 · 농사 Lv.10 · 농장 증표 30개");
  });

  it("선택한 동물 조합과 생산 정보를 부지별로 표시한다", () => {
    const base = emptyFarmState(1_000);
    let ranch = unlockRanchSlot(base.ranch, "slot-2", "chicken", 100, 1_000).ranch;
    ranch = unlockRanchSlot(ranch, "slot-3", "cow", 100, 1_000).ranch;
    ranch = unlockRanchSlot(ranch, "slot-4", "pig", 100, 1_000).ranch;
    const html = renderRanch({
      ...base,
      ranch,
      stats: {
        ...base.stats,
        farmingXp: farmingLevelXpThreshold(100),
        reputation: 50_000,
      },
    });

    expect(html).toContain("부지 2 · 닭장");
    expect(html).toContain("부지 3 · 외양간");
    expect(html).toContain("부지 4 · 돼지우리");
    expect(html).toContain("2시간 · 달걀 2개 · 농사 XP 2");
    expect(html).toContain("6시간 · 우유 3개 · 농사 XP 6");
    expect(html).toContain("12시간 · 돼지고기 4개 / 마리 · 농사 XP 8");
    expect(html).toContain("최대 2마리");
    expect(html).toContain("비육 중");
  });

  it("빈 축사에만 재건축 선택을 표시하고 대상별 비용을 안내한다", () => {
    const base = emptyFarmState(1_000);
    const opened = unlockRanchSlot(base.ranch, "slot-2", "chicken", 100, 1_000).ranch;
    const farm = {
      ...base,
      ranch: opened,
      stats: {
        ...base.stats,
        farmingXp: farmingLevelXpThreshold(100),
        reputation: 10_000,
      },
    };
    const idleHtml = renderRanch(farm);
    const fedHtml = renderRanch(
      { ...farm, ranch: addRanchFeed(opened, "slot-2", 1, 1_000) },
      1_000,
    );

    expect(idleHtml).toContain('aria-label="부지 2 재건축"');
    expect(idleHtml).toContain("외양간으로 재건축 · 1,000개");
    expect(idleHtml).toContain("돼지우리로 재건축 · 2,000개");
    expect(fedHtml).not.toContain('aria-label="부지 2 재건축"');
  });

  it("재건축 확인에 대상 축사와 비용을 명시한다", async () => {
    const onRebuild = vi.fn();
    const confirm = vi.fn(async () => true);

    expect(
      await confirmRanchRebuild({
        slotId: "slot-2",
        animalId: "pig",
        confirm,
        onRebuild,
      }),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("돼지우리로 재건축"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("농장 증표 2,000개"));
    expect(onRebuild).toHaveBeenCalledWith("slot-2", "pig");
  });

  it("완료된 돼지를 출하 대기로 표시한다", () => {
    const base = emptyFarmState(1_000);
    const pig = unlockRanchSlot(base.ranch, "slot-2", "pig", 100, 1_000).ranch;
    const now = 1_000 + 12 * HOUR;
    const farm = { ...base, ranch: settleRanch(pig, now) };
    const html = renderRanch(farm, now);

    expect(html).toContain("돼지고기 4개");
    expect(html).toContain("출하 대기");
    expect(html).toContain("모두 수확·출하");
  });

  it("서로 다른 시각에 들어온 돼지 두 마리의 상태를 따로 표시한다", () => {
    const base = emptyFarmState(1_000);
    const pig = unlockRanchSlot(base.ranch, "slot-2", "pig", 100, 1_000).ranch;
    const twoPigs = addRanchFeed(pig, "slot-2", 2, 1_000 + 6 * HOUR);
    const farm = {
      ...base,
      inventory: { ...base.inventory, compound_feed: 2 },
      ranch: settleRanch(twoPigs, 1_000 + 12 * HOUR),
    };
    const html = renderRanch(farm, 1_000 + 12 * HOUR);

    expect(html).toContain("돼지 1");
    expect(html).toContain("돼지 2");
    expect(html).toContain("출하 대기");
    expect(html).toContain("6시간");
    expect(html).toContain("돼지우리 가득 참");
  });

  it("씨앗 선별을 배우기 전에는 목장 작업을 숨긴다", () => {
    const html = renderRanch(emptyFarmState(1_000), 1_000, false);

    expect(html).toContain("씨앗 선별을 배우면 목장이 열립니다");
    expect(html).not.toContain("사료 넣기");
  });
});
