// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  V2TrophyCabinetView,
  splitTrophiesForCabinet,
  type TrophyOption,
} from "./V2TrophyCabinetView";

afterEach(cleanup);

const trophy = (patch: Partial<TrophyOption> & Pick<TrophyOption, "id">): TrophyOption => ({
  title: patch.id,
  desc: `${patch.id} 조건`,
  points: 10,
  badgeTier: "bronze",
  unlocked: false,
  ...patch,
});

const OPTIONS: TrophyOption[] = [
  trophy({ id: "battle_100", title: "백전", unlocked: true }),
  trophy({ id: "boss_10", title: "거인 사냥꾼" }),
  trophy({ id: "fish_master", title: "어보 숙련", kind: "mastery", progress: { current: 2, required: 5 } }),
  trophy({ id: "month_1", title: "강과 호수의 달", kind: "research" }),
  trophy({ id: "boss_20", title: "거인 학살자" }),
];

const preview = { ok: true, standOwned: true, visible: true, slots: [null, null, null] as const, trophyOptions: OPTIONS };

describe("트로피 전시대 수집 목록", () => {
  it("획득한 트로피와 종류별 미획득 묶음으로 나눈다", () => {
    const split = splitTrophiesForCabinet(OPTIONS);

    expect(split.unlocked.map((item) => item.id)).toEqual(["battle_100"]);
    expect(split.lockedByKind.map((group) => [group.kind, group.items.map((item) => item.id)])).toEqual([
      ["achievement", ["boss_10", "boss_20"]],
      ["mastery", ["fish_master"]],
      ["research", ["month_1"]],
    ]);
  });

  it("미획득은 종류별 접기 안의 작은 행으로 보여 준다", () => {
    const html = renderToStaticMarkup(<V2TrophyCabinetView previewData={{ ...preview, slots: [null, null, null] }} />);

    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?미획득 업적 2개/);
    expect(html).toContain("미획득 도감 숙련 1개");
    expect(html).toContain("미획득 월간 연구 1개");
    expect(html).toContain("2 / 5");
    expect(html).toContain('role="group" aria-label="트로피 보기"');
    expect(html).not.toMatch(/text-\[1[01]px\]/);
  });

  it("미획득 보기에서는 묶음을 펴 두고, 미획득 트로피를 고르면 조건을 보여 준다", () => {
    render(<V2TrophyCabinetView previewData={{ ...preview, slots: [null, null, null] }} />);

    fireEvent.click(screen.getByRole("button", { name: "미획득" }));
    const lockedGroups = Array.from(document.querySelectorAll("details")).filter((group) =>
      group.textContent?.includes("미획득 업적"),
    );
    expect(lockedGroups).toHaveLength(1);
    expect(lockedGroups[0].open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /거인 사냥꾼/ }));
    expect(screen.getByRole("heading", { name: "거인 사냥꾼" })).toBeTruthy();
    expect(screen.getAllByText("boss_10 조건").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "획득 후 전시 가능" })).toBeTruthy();
  });
});
