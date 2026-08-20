import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2TrophyCabinetView } from "./V2TrophyCabinetView";
import { profileSelectionForTrophy } from "./V2TrophyCabinetView";

describe("V2TrophyCabinetView", () => {
  it("shows a compact representative area and an opaque unlocked/locked grid", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: true,
          visible: true,
          slots: [
            { kind: "achievement", achievementId: "battle_100" },
            null,
            null,
          ],
          trophyOptions: [
            {
              id: "battle_100",
              title: "백전",
              desc: "전투를 100회 완료하세요.",
              points: 10,
              badgeTier: "bronze",
              unlocked: true,
            },
            {
              id: "boss_10",
              title: "거인 사냥꾼",
              desc: "보스를 10회 처치하세요.",
              points: 30,
              badgeTier: "gold",
              unlocked: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("대표 트로피 3종");
    expect(html).toContain("1 / 2 획득");
    expect(html).toContain("백전");
    expect(html).toContain("거인 사냥꾼");
    expect(html).toContain("미획득");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("opacity-40");
  });

  it("keeps collection browsing available before purchasing the display stand", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: false,
          slots: [null, null, null],
          trophyOptions: [],
        }}
      />,
    );

    expect(html).toContain("트로피 수집 현황은 볼 수 있지만");
    expect(html).toContain("대표 배지 전시대가 필요합니다");
  });

  it("renders mastery platinum and diamond goals with opaque searchable filters", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: true,
          visible: true,
          slots: [{ kind: "masteryTrophy", trophyId: "mastery:fish" }, null, null],
          trophyOptions: [
            {
              id: "mastery:fish",
              kind: "mastery",
              category: "fish",
              title: "만경의 어탁",
              desc: "다음 다이아 승급까지 2 / 5",
              points: 0,
              badgeTier: "platinum",
              unlocked: true,
              currentTier: "platinum",
              nextTier: "diamond",
              progress: { current: 2, required: 5 },
              tierAchievedAt: {
                bronze: "2026-01-01T00:00:00.000Z",
                silver: "2026-02-01T00:00:00.000Z",
                gold: "2026-03-01T00:00:00.000Z",
                platinum: "2026-04-01T00:00:00.000Z",
              },
            },
            {
              id: "mastery:overall",
              kind: "mastery",
              category: "overall",
              title: "모험왕의 대서",
              desc: "다음 다이아 승급까지 4 / 6",
              points: 0,
              badgeTier: "diamond",
              unlocked: false,
              currentTier: null,
              nextTier: "diamond",
              progress: { current: 4, required: 6 },
              tierAchievedAt: {},
            },
          ],
        }}
      />,
    );

    expect(html).toContain("트로피 검색");
    expect(html).toContain("업적 · 도감 숙련");
    expect(html).toContain("분야 선택");
    expect(html).toContain("등급 선택");
    expect(html).toContain("연도 선택");
    expect(html).toContain("2026년");
    expect(html).toContain("백금");
    expect(html).toContain("다이아");
    expect(html).toContain("2 / 5");
    expect(html).toContain("4 / 6");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("opacity-40");
  });

  it("uses the stable mastery family ID for profile selection", () => {
    expect(profileSelectionForTrophy({
      id: "mastery:fish",
      kind: "mastery",
    })).toEqual({ kind: "masteryTrophy", trophyId: "mastery:fish" });
    expect(profileSelectionForTrophy({
      id: "combat_100",
      kind: "achievement",
    })).toEqual({ kind: "achievement", achievementId: "combat_100" });
    expect(profileSelectionForTrophy({
      id: "research:2026-08",
      kind: "research",
    })).toEqual({ kind: "masteryTrophy", trophyId: "research:2026-08" });
  });

  it("renders monthly research trophies as a separate collection kind", () => {
    const html = renderToStaticMarkup(
      <V2TrophyCabinetView
        previewData={{
          ok: true,
          standOwned: true,
          visible: true,
          slots: [{ kind: "masteryTrophy", trophyId: "research:2026-08" }, null, null],
          trophyOptions: [{
            id: "research:2026-08",
            kind: "research",
            category: "research",
            title: "강과 호수의 달",
            desc: "2026-08 · 최종 1위 · 19,000점",
            points: 0,
            badgeTier: "legendary",
            unlocked: true,
            currentTier: "legendary",
            nextTier: null,
            progress: null,
            tierAchievedAt: { legendary: "2026-08-31T15:00:01.000Z" },
          }],
        }}
      />,
    );

    expect(html).toContain("월간 연구");
    expect(html).toContain("강과 호수의 달");
    expect(html).toContain("최종 1위");
  });
});
