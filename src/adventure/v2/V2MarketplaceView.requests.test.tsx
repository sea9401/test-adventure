// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2MarketplaceView } from "./V2MarketplaceView";
import type {
  V2EquipInstance,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { marketplacePreview } from "@/app/dev/marketplace/MarketplaceHarness";
import { invalidateMarketplacePrices } from "./marketplace/marketplacePriceCache";

let ownedEquipment: V2EquipInstance[] = [];
let equippedEquipment: Partial<Record<V2EquipSlot, string>> = {};
let browseListings: MarketplacePreviewListing[] = [];
let myBidRows: Array<Record<string, unknown>> = [];
let historyTrades: Array<Record<string, unknown>> = [];

type MarketplacePreviewListing = (typeof marketplacePreview.listings)[number];

const gameMocks = vi.hoisted(() => ({
  refreshGameState: vi.fn(async () => {}),
  applyResourcePatch: vi.fn(),
}));

vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    coreLoopOn: true,
    bankedGold: 0,
    frontierDepth: 42,
    ...gameMocks,
  }),
}));

function responseFor(url: string): Response {
  if (url.includes("/my-bids")) {
    return Response.json({ ok: true, bids: myBidRows });
  }
  if (url.includes("/browse")) {
    return Response.json({
      ok: true,
      viewerGold: 0,
      auctionHours: 6,
      bidExtensionWindowMinutes: 10,
      bidExtensionMinutes: 10,
      listings: browseListings,
    });
  }
  if (url.includes("/sell-overview")) {
    return Response.json({
      ok: true,
      owned: ownedEquipment,
      equipped: equippedEquipment,
      materials: {},
      rareMaps: [],
      cashItems: {},
      cookingFoods: {},
      cookingFoodDefinitions: {},
      specimens: {},
    });
  }
  if (url.includes("/equipment")) {
    return Response.json({
      owned: ownedEquipment,
      equipped: equippedEquipment,
    });
  }
  if (url.includes("/prices")) {
    return Response.json({ ok: true, prices: {} });
  }
  if (url.includes("/price-alerts")) {
    return Response.json({ ok: true, alerts: [] });
  }
  if (url.includes("/history")) {
    return Response.json({ ok: true, trades: historyTrades });
  }
  return Response.json({ ok: true });
}

describe("V2MarketplaceView request timing", () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) =>
      responseFor(String(input)),
  );

  beforeEach(() => {
    invalidateMarketplacePrices();
    vi.clearAllMocks();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      responseFor(String(input)),
    );
    ownedEquipment = [];
    equippedEquipment = {};
    browseListings = [];
    myBidRows = [];
    historyTrades = [];
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("coalesces visibility refreshes while a browse read is pending", async () => {
    let resolveBrowse!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveBrowse = resolve; });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes("/browse") ? pending : responseFor(String(input)),
    );
    render(<RewardToastProvider><V2MarketplaceView onBack={() => {}} /></RewardToastProvider>);
    const browseCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).includes("/browse"));
    await waitFor(() => expect(browseCalls()).toHaveLength(1));
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(document, new Event("visibilitychange"));
    expect(browseCalls()).toHaveLength(1);
    resolveBrowse(responseFor("/browse"));
    await waitFor(() => expect(screen.queryByText("불러오는 중…")).toBeNull());
  });

  it("does not load buy orders or price alerts on the initial browse tab", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/v2/marketplace/browse"),
        ),
      ).toBe(true);
    });

    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.some((url) => url.includes("/buy-orders"))).toBe(false);
    expect(requestedUrls.some((url) => url.includes("/price-alerts"))).toBe(false);
  });

  it("reuses shared prices on a quick screen revisit while reloading personal equipment", async () => {
    const view = () => (
      <RewardToastProvider><V2MarketplaceView onBack={() => {}} /></RewardToastProvider>
    );
    const first = render(view());
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/prices"))).toBe(true));
    first.unmount();
    render(view());
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/equipment"))).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/prices"))).toHaveLength(1);
  });

  it("강화 장비를 판매 등록 목록에 표시한다", async () => {
    ownedEquipment = [
      {
        iid: "enhanced-iron-sword",
        id: "v2_iron_sword",
        enhance: { level: 3, bonusPct: 4 },
      },
    ];

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /판매.*아이템 올리기/ }),
    );

    expect(await screen.findByText("철검")).not.toBeNull();
    expect(screen.getByLabelText("강화 +3")).not.toBeNull();
  });

  it("판매 입력 오류를 즉시 읽을 수 있는 alert로 표시한다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v2/marketplace/sell-overview")) {
        return Response.json({
          ok: true,
          owned: [],
          equipped: {},
          materials: { v2_timber: 10 },
          rareMaps: [],
          cashItems: {},
          cookingFoods: {},
          cookingFoodDefinitions: {},
          specimens: {},
        });
      }
      return responseFor(url);
    });

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /판매.*아이템 올리기/ }),
    );
    fireEvent.click(await screen.findByRole("tab", { name: "재료" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "등록" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "묶음 전체 시작 입찰가는 1 이상 정수로 입력하세요.",
    );
  });

  it("loads only price alerts when the alert management tab opens", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /내 거래/ }));
    fireEvent.click(await screen.findByRole("button", { name: /가격 알림/ }));

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(requestedUrls.some((url) => url.includes("/price-alerts"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/buy-orders"))).toBe(false);
    });
  });

  it("판매 탭 진입 시 inventory 네 요청 대신 overview 한 건을 사용한다", async () => {
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/browse"))).toBe(true);
    });
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /판매.*아이템 올리기/ }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).includes("/api/v2/marketplace/sell-overview"),
        ),
      ).toHaveLength(1);
    });

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("/api/v2/me/equipment"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/v2/me/inventory"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/v2/me/rare-maps"))).toBe(false);
    expect(urls.some((url) => url.includes("/api/v2/me/fishing-specimens"))).toBe(false);
  });

  it("merges an extended bid deadline into the visible whole-lot card", async () => {
    const now = Date.now();
    let bidPlaced = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/browse")) {
        return Response.json({
          ok: true,
          viewerGold: 10_000,
          auctionHours: 6,
          bidExtensionWindowMinutes: 10,
          bidExtensionMinutes: 10,
          listings: [
            {
              id: 7,
              isMine: false,
              isHighestBidder: false,
              kind: "material",
              itemId: "iron_ore",
              itemName: "철광석",
              quantity: 2,
              price: 100,
              instancePayload: null,
              createdAt: new Date(now - 60_000).toISOString(),
              bidEndsAt: new Date(now + (bidPlaced ? 15 : 5) * 60_000).toISOString(),
              expiresAt: new Date(now + (bidPlaced ? 15 : 5) * 60_000 + 1).toISOString(),
              highestBid: bidPlaced ? 100 : null,
              bidCount: bidPlaced ? 1 : 0,
              bidResolvedAt: null,
              nextBid: 100,
            },
          ],
        });
      }
      if (url.endsWith("/bid") && init?.method === "POST") {
        bidPlaced = true;
        return Response.json({
          ok: true,
          highestBid: 100,
          nextBid: 105,
          bidEndsAt: new Date(now + 15 * 60_000).toISOString(),
          extended: true,
          bidCount: 8,
          expiresAt: new Date(now + 15 * 60_000 + 1).toISOString(),
          gold: 9900,
          bankedGold: 0,
        });
      }
      return responseFor(url);
    });

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "재료" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "철광석 2개 묶음 입찰" }),
    );
    const bidButtons = await screen.findAllByRole("button", { name: "입찰" });
    fireEvent.click(bidButtons[bidButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("15분 남음")).toBeTruthy();
      expect(screen.getAllByText(/마감 10분 연장/).length).toBeGreaterThan(0);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/browse"))).toHaveLength(1);
    expect(gameMocks.refreshGameState).not.toHaveBeenCalled();
    expect(gameMocks.applyResourcePatch).toHaveBeenCalledWith({ gold: 9900, bankedGold: 0 });
    const bidRequest = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/bid") && init?.method === "POST",
    );
    expect(JSON.parse(String(bidRequest?.[1]?.body))).toEqual({
      listingId: 7,
      amount: 100,
    });
    fireEvent.click(screen.getByRole("button", { name: /판매.*아이템 올리기/ }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/prices"))).toHaveLength(2);
    });
  });

  it("기기 시계가 2분 빨라도 서버 마감 전에는 입찰을 유지한다", async () => {
    const clientNow = Date.parse("2026-09-03T09:00:00.000Z");
    const serverNow = Date.parse("2026-09-03T08:58:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(clientNow);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/browse")) {
        return Response.json({
          ok: true,
          viewerGold: 10_000,
          serverNow,
          auctionHours: 6,
          bidExtensionWindowMinutes: 10,
          bidExtensionMinutes: 10,
          listings: [
            {
              id: 8,
              isMine: false,
              isHighestBidder: false,
              hasMyBid: false,
              kind: "material",
              itemId: "iron_ore",
              itemName: "철광석",
              quantity: 2,
              price: 100,
              instancePayload: null,
              createdAt: "2026-09-03T03:00:00.000Z",
              bidEndsAt: "2026-09-03T09:00:00.000Z",
              expiresAt: "2026-09-03T09:00:00.001Z",
              highestBid: null,
              bidCount: 0,
              bidResolvedAt: null,
              nextBid: 100,
            },
          ],
        });
      }
      return responseFor(url);
    });

    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );
    fireEvent.click(await screen.findByRole("tab", { name: "재료" }));

    expect(await screen.findByText("2분 남음")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "철광석 2개 묶음 입찰" }),
    ).not.toBeNull();
    expect(screen.queryByText("입찰 종료 · 정산 중")).toBeNull();
  });
  it("내 거래 진입 시 내 입찰을 불러와 별도 탭에서 표시한다", async () => {
    const source = marketplacePreview.listings[0];
    myBidRows = [
      {
        ...source,
        status: "active",
        closedAt: null,
        myHighestBid: 850_000,
        lastBidAt: "2026-09-02T06:05:00.000Z",
        isBuyer: false,
      },
    ];
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /내 거래/ }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/v2/marketplace/my-bids"),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /내 입찰/ }));
    expect(await screen.findByText(source.itemName)).not.toBeNull();
    expect(screen.getByText("입찰금 예치 중")).not.toBeNull();
  });

  it("최근 거래에서 품목명으로 체결 목록을 검색한다", async () => {
    historyTrades = [
      {
        id: 41,
        kind: "material",
        itemId: "iron_ore",
        itemName: "철광석",
        quantity: 3,
        price: 300,
        instancePayload: null,
        closedAt: "2026-09-03T01:00:00.000Z",
      },
      {
        id: 42,
        kind: "material",
        itemId: "silver_ore",
        itemName: "은광석",
        quantity: 2,
        price: 400,
        instancePayload: null,
        closedAt: "2026-09-03T02:00:00.000Z",
      },
    ];
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /최근 거래/ }));
    expect(await screen.findByText("철광석")).not.toBeNull();
    expect(screen.getByText("은광석")).not.toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "최근 거래 품목 검색" }), {
      target: { value: " 은 " },
    });

    await waitFor(() => {
      expect(screen.queryByText("철광석")).toBeNull();
      expect(screen.getByText("은광석")).not.toBeNull();
    });
  });
  it("내 항목만 보기에서 기존 순서를 유지하며 무관한 매물을 숨긴다", async () => {
    const [own, leading, participated] = marketplacePreview.listings;
    browseListings = [
      { ...own, isMine: true, isHighestBidder: false, hasMyBid: false },
      { ...leading, isMine: false, isHighestBidder: true, hasMyBid: true },
      {
        ...participated,
        isMine: false,
        isHighestBidder: false,
        hasMyBid: true,
      },
      {
        ...participated,
        id: 99,
        itemName: "무관한 장검",
        isMine: false,
        isHighestBidder: false,
        hasMyBid: false,
      },
    ];
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    expect(await screen.findByText("무관한 장검")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내 항목만 보기" }));

    await waitFor(() => {
      expect(screen.queryByText("무관한 장검")).toBeNull();
    });
    const personalNames = [own.itemName, leading.itemName, participated.itemName];
    for (const name of personalNames) {
      expect(screen.getByText(name)).not.toBeNull();
    }
  });

  it("내 입찰을 불러온 뒤 입찰하면 구매 목록과 내 입찰을 함께 갱신한다", async () => {
    const source = marketplacePreview.listings[0];
    browseListings = [{ ...source, isMine: false }];
    render(
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} />
      </RewardToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /내 거래/ }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/v2/marketplace/my-bids"),
        ),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: /내 입찰/ }));
    await screen.findByText("아직 참여한 입찰이 없어요.");
    fireEvent.click(screen.getByRole("button", { name: /경매/ }));
    fireEvent.click(await screen.findByRole("button", { name: "입찰" }));
    await screen.findByRole("heading", { name: "공개 입찰" });

    const countRequests = (part: string) =>
      fetchMock.mock.calls.filter(([input]) => String(input).includes(part)).length;
    const browseBefore = countRequests("/api/v2/marketplace/browse");
    const myBidsBefore = countRequests("/api/v2/marketplace/my-bids");
    const bidButtons = screen.getAllByRole("button", { name: "입찰" });
    fireEvent.click(bidButtons[bidButtons.length - 1]);

    await waitFor(() => {
      expect(countRequests("/api/v2/marketplace/browse")).toBeGreaterThan(
        browseBefore,
      );
      expect(countRequests("/api/v2/marketplace/my-bids")).toBeGreaterThan(
        myBidsBefore,
      );
    });
  });

it("선택한 24시간을 장비 등록 요청에 전달한다",async()=>{
  ownedEquipment=[{iid:"duration-sword",id:"v2_iron_sword"}];
  render(<RewardToastProvider><V2MarketplaceView onBack={()=>{}} /></RewardToastProvider>);
  fireEvent.click(screen.getByRole("button",{name:/판매.*아이템 올리기/}));
  await screen.findByText("철검");
  fireEvent.change(screen.getByLabelText("경매 등록 시간"),{target:{value:"24"}});
  fireEvent.change(screen.getByPlaceholderText("시작 입찰가"),{target:{value:"1000"}});
  fireEvent.click(screen.getByRole("button",{name:"등록"}));
  await waitFor(()=>expect(fetchMock.mock.calls.some(([url,init])=>String(url).endsWith("/marketplace/list") && JSON.parse(String(init?.body)).durationHours===24)).toBe(true));
});

});

describe("경매장 건의 #658", () => {
  beforeEach(() => {
    localStorage.clear();
    browseListings = [1, 2].map(id => ({ ...marketplacePreview.listings[0], id }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => responseFor(String(input))));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

  it("같은 이름의 두 매물 중 선택한 등록 건만 모아 보고 재진입해도 유지한다", async () => {
    const view = () => <RewardToastProvider><V2MarketplaceView onBack={() => {}} /></RewardToastProvider>;
    const first = render(view());
    const name = `${browseListings[0].itemName} 관심 매물 추가`;
    const buttons = await screen.findAllByRole("button", { name });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByRole("button", { name: "관심 매물만 보기" }));
    await waitFor(() => expect(screen.queryAllByRole("button", { name })).toHaveLength(0));
    expect(screen.getAllByRole("button", { name: /관심 매물 해제/ })).toHaveLength(1);
    first.unmount();
    render(view());
    await screen.findByRole("button", { name: /관심 매물 해제/ });
    expect(screen.getAllByRole("button", { name })).toHaveLength(1);
  });

  it("미판매 탭에서 만료·취소와 등록가를 표시하며 체결로 표시하지 않는다", async () => {
    historyTrades = ["expired", "cancelled"].map((status, index) => ({
      id: index + 1, kind: "material", itemId: "v2_iron_ore", itemName: "철광석",
      quantity: 5, price: 500, instancePayload: null, closedAt: "2026-09-12T00:00:00Z", side: "sell", status,
    }));
    render(<RewardToastProvider><V2MarketplaceView onBack={() => {}} /></RewardToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: /내 거래.*판매·입찰 관리/ }));
    fireEvent.click(screen.getByRole("button", { name: "미판매 종료" }));
    await screen.findByText("기간 만료");
    expect(screen.getByText("등록 취소")).not.toBeNull();
    expect(screen.getAllByText("등록가")).toHaveLength(2);
    expect(screen.queryByText("체결가")).toBeNull();
    expect(screen.getAllByTestId("marketplace-listing-action").map(node => node.textContent)).toEqual([expect.stringContaining("기간 만료"), expect.stringContaining("등록 취소")]);
  });
});
