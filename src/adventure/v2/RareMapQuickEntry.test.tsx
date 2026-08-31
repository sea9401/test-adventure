// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  heldRareMapsAfterExpedition,
  RareMapQuickEntry,
  sortHuntRareMaps,
} from "./RareMapQuickEntry";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";

const maps: RareMapInstance[] = [
  {
    iid: "rm-later",
    kind: "sage_map",
    depth: 84,
    runsLeft: 30,
    foundAt: 2_000,
  },
  {
    iid: "rm-location",
    kind: "secret_shop_map",
    depth: 84,
    runsLeft: 1,
    foundAt: 500,
  },
  {
    iid: "rm-first",
    kind: "worn_map",
    depth: 82,
    runsLeft: 17,
    foundAt: 1_000,
  },
];

afterEach(cleanup);

describe("희귀 탐사 빠른 입장", () => {
  it("사냥형 지도만 만료 순으로 정렬한다", () => {
    // Break caught: a location map or later-expiring map becomes the default hunt action.
    expect(sortHuntRareMaps(maps).map((map) => map.iid)).toEqual([
      "rm-first",
      "rm-later",
    ]);
  });

  it("가장 먼저 만료되는 지도를 기본 행동으로 표시한다", () => {
    const onEnter = vi.fn();
    render(
      <RareMapQuickEntry
        maps={maps}
        serverNow={1_000}
        onEnter={onEnter}
      />,
    );

    expect(screen.getByText("별의 무덤 · 심부 · 지도 2개")).toBeDefined();
    expect(screen.getByText("보상 17회분")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "희귀 탐사 · 낡은 탐사로" }),
    );
    expect(onEnter).toHaveBeenCalledWith(maps[2]);
  });

  it("여러 장이면 다른 지도를 펼쳐 직접 선택한다", () => {
    const onEnter = vi.fn();
    render(
      <RareMapQuickEntry
        maps={maps}
        serverNow={1_000}
        onEnter={onEnter}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다른 지도" }));
    fireEvent.click(screen.getByRole("button", { name: /현자의 탐사로/ }));
    expect(onEnter).toHaveBeenCalledWith(maps[0]);
  });

  it("승리한 지도만 목록에서 제거하고 패배한 지도는 보존한다", () => {
    // Break caught: a failed expedition disappears from quick entry, or a cleared one remains usable.
    expect(
      heldRareMapsAfterExpedition(maps, "rm-first", true).map((map) => map.iid),
    ).toEqual(["rm-later", "rm-location"]);
    expect(heldRareMapsAfterExpedition(maps, "rm-first", false)).toEqual(maps);
  });
});
