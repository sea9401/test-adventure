// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hunt: vi.fn(),
  huntBatch: vi.fn(),
}));

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({ state: { flags: [] }, set: vi.fn() }),
}));
vi.mock("@/adventure/v2/useDungeonHunt", () => ({
  useDungeonHunt: () => ({
    busy: false,
    lastResult: null,
    hunt: mocks.hunt,
    huntBatch: mocks.huntBatch,
  }),
}));

import { V2DungeonFloorView } from "./V2DungeonFloorView";

const result = (expGained: number) => ({
  floor: 1,
  enemyName: "슬라임",
  won: true,
  expGained,
  goldGained: 3,
  levelsGained: 0,
  turns: 1,
  hpBefore: 100,
  hpAfter: 95,
  maxHp: 100,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("던전 인라인 결과 연결", () => {
  it("결과창을 띄우지 않고 같은 화면에서 결과 확인과 다음 사냥을 이어간다", async () => {
    mocks.hunt
      .mockResolvedValueOnce(result(5))
      .mockResolvedValueOnce(result(9));

    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 100, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    const huntButton = screen.getByRole("button", { name: /^사냥 \(/ });
    fireEvent.click(huntButton);

    const firstResult = await screen.findByRole("region", {
      name: "최근 사냥 결과",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(firstResult).getByText("+5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /닫기/ })).toBeNull();

    fireEvent.click(huntButton);

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", { name: "최근 사냥 결과" }),
        ).getByText("+9"),
      ).toBeTruthy(),
    );
  });

  it("사냥 전에는 안내를, 사냥 뒤에는 결과 머리에 싸운 몬스터와 승패를 보여 준다", async () => {
    mocks.hunt.mockResolvedValueOnce(result(5));

    const { container } = render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 95, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByText("사냥하면 여기에 싸운 몬스터와 결과가 나옵니다"),
    ).toBeTruthy();
    expect(container.querySelector("[data-hunt-encounter]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^사냥 \(/ }));

    const region = await screen.findByRole("region", { name: "최근 사냥 결과" });
    const encounter = region.querySelector("[data-hunt-encounter]");
    expect(encounter?.textContent).toContain("방금 전투");
    expect(encounter?.textContent).toContain("승리");
    expect(encounter?.textContent).toContain("슬라임");
    expect(encounter?.textContent).toContain("95 / 100");
    expect(
      screen.queryByText("사냥하면 여기에 싸운 몬스터와 결과가 나옵니다"),
    ).toBeNull();
    // 설정을 펼치면 사냥 버튼 줄이 떠 있는 채팅 버튼보다 위로 올라온다.
    const bar = container
      .querySelector("[data-hunt-primary-actions]")!
      .closest(".ui-game-card")!;
    expect(bar.className).toContain("max-sm:fixed");
    // 하단 메뉴 바에 틈 없이 붙도록 부모의 세로 간격 여백을 지운다.
    expect(bar.className).toContain("max-sm:m-0");
    expect(bar.className).toContain("max-sm:z-20");
    fireEvent.click(screen.getByRole("button", { name: "전투 설정" }));
    expect(bar.className).toContain("max-sm:z-[45]");
    fireEvent.click(screen.getByRole("button", { name: "전투 설정" }));
    // 사냥 버튼은 결과 카드보다 앞에 있어, 결과 높이가 바뀌어도 자리가 움직이지 않는다.
    const actions = container.querySelector("[data-hunt-primary-actions]");
    expect(
      actions!.compareDocumentPosition(region) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("새로 발견한 레어맵 입장 동작을 인라인 결과 아래에 유지한다", async () => {
    const onEnterRareMap = vi.fn();
    const rareMap = {
      iid: "rare-map-1",
      kind: "worn_map" as const,
      depth: 1,
      runsLeft: 30,
      foundAt: Date.now(),
    };
    mocks.hunt.mockResolvedValue({
      ...result(5),
      rareMapDrop: rareMap.kind,
      rareMapDropInstance: rareMap,
    });

    render(
      <V2DungeonFloorView
        floorId={1}
        outpostId="start"
        playerName="모험가"
        playerGender="male"
        stamina={{ current: 100, lastUpdatedAt: Date.now() }}
        setStamina={vi.fn()}
        hp={{ hp: 100, maxHp: 100, anchorMs: Date.now() }}
        setHp={vi.fn()}
        onBack={vi.fn()}
        onEnterRareMap={onEnterRareMap}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^사냥 \(/ }));

    const enterRareMap = await screen.findByRole("button", {
      name: "레어맵 · 낡은 탐사로",
    });
    fireEvent.click(enterRareMap);
    expect(onEnterRareMap).toHaveBeenCalledWith(rareMap);
  });
});
