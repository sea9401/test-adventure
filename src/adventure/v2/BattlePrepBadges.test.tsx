// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ActiveBattlePrepBadges, battlePrepBadgeRows } from "./BattlePrepBadges";

afterEach(cleanup);

describe("battlePrepBadgeRows", () => {
  it("켜 둔 칸만 칸 순서대로 돌려준다", () => {
    const now = 1_000;
    expect(
      battlePrepBadgeRows(
        {
          armor: { itemId: "v2_prep_brace_3", expiresAt: now + 5 },
          weapon: { itemId: "v2_prep_whetstone_1", expiresAt: now },
        },
        now,
      ),
    ).toEqual([
      {
        slot: "armor",
        slotName: "방어구 손질",
        itemName: "상급 보강재",
        effectText: "방어력·마법방어력 +65 · 최대 HP +1,000",
        expiresAt: now + 5,
      },
    ]);
    expect(
      battlePrepBadgeRows(
        {
          armor: { itemId: "v2_prep_brace_1", expiresAt: now + 5 },
          weapon: { itemId: "v2_prep_whetstone_master", expiresAt: now + 9 },
        },
        now,
      ).map((row) => row.slot),
    ).toEqual(["weapon", "armor"]);
    expect(
      battlePrepBadgeRows(
        {
          vigor: { itemId: "v2_prep_fishoil_3", expiresAt: now + 7 },
          armor: { itemId: "v2_prep_brace_1", expiresAt: now + 5 },
        },
        now,
      ),
    ).toMatchObject([
      { slot: "armor" },
      { slot: "vigor", slotName: "기력 보충", itemName: "상급 어유", effectText: "최대 MP +800", expiresAt: now + 7 },
    ]);
    expect(battlePrepBadgeRows(null, now)).toEqual([]);
    expect(battlePrepBadgeRows(undefined, now)).toEqual([]);
  });
});

describe("ActiveBattlePrepBadges", () => {
  it("켜 둔 준비물의 이름·효과·남은 시간을 보여 준다", () => {
    render(
      <ActiveBattlePrepBadges
        active={{ weapon: { itemId: "v2_prep_whetstone_3", expiresAt: Date.now() + 2 * 3_600_000 } }}
      />,
    );
    expect(screen.getByText("상급 숫돌")).toBeTruthy();
    expect(screen.getByText(/공격력·마법공격력 \+130/)).toBeTruthy();
    expect(screen.queryByText("상급 보강재")).toBeNull();
  });

  it("기력 보충 칸도 같은 모양으로 보여 준다", () => {
    render(
      <ActiveBattlePrepBadges
        active={{ vigor: { itemId: "v2_prep_fishoil_master", expiresAt: Date.now() + 20 * 3_600_000 } }}
      />,
    );
    expect(screen.getByText("명장의 어유")).toBeTruthy();
    expect(screen.getByText(/최대 MP \+1,100/)).toBeTruthy();
    expect(screen.getByTitle("기력 보충 · 명장의 어유 · 최대 MP +1,100")).toBeTruthy();
  });

  it("켜 둔 것이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<ActiveBattlePrepBadges active={null} />);
    expect(container.firstChild).toBeNull();
  });
});
