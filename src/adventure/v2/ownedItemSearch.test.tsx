// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { V2InventoryView } from "./V2InventoryView";
import { V2MarketplaceView } from "./V2MarketplaceView";
import { RewardToastProvider } from "./RewardToastProvider";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { SP_FRUIT } from "@/adventure/data/v2/spFruit";
import { itemTabForMaterial } from "./v2ItemListShared";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/inventory",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("./GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({ frontierDepth: 42, coreLoopOn: true, bankedGold: 0,
    refreshGameState: vi.fn(), setGold: vi.fn(), setBankedGold: vi.fn() }),
}));

const [materialA, materialB] = Object.values(V2_MATERIALS).filter((item) => itemTabForMaterial(item.id) === "material");
const defaultMaterials: Record<string, number> = { [materialA.id]: 12, [materialB.id]: 3, [SP_FRUIT[1].materialId]: 2 };
let materials = defaultMaterials;
const fetchMock = vi.fn(async () => Response.json({
  ok: true, listings: [], prices: {}, owned: [
    { iid: "iron", id: "v2_iron_sword" },
    { iid: "mithril", id: "v2_mithril_sword" },
  ], equipped: {}, rareMaps: [], cashItems: {}, cookingFoods: {},
  cookingFoodDefinitions: {}, specimens: {},
  materials,
}));

beforeEach(() => {
  materials = defaultMaterials;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["인벤토리", "판매"] as const)("%s에서 장비·재료·소모품 검색과 초기화를 연결한다", async (view) => {
  render(<RewardToastProvider>{view === "인벤토리"
    ? <V2InventoryView onBack={() => {}} />
    : <V2MarketplaceView onBack={() => {}} />}</RewardToastProvider>);
  if (view === "판매") fireEvent.click(screen.getByRole("button", { name: /판매.*아이템 올리기/ }));
  await screen.findByText("철검");
  const label = view === "판매" ? "판매 아이템 검색" : "인벤토리 검색";
  const input = screen.getByRole("searchbox", { name: label });
  fireEvent.change(input, { target: { value: " 철검 " } });
  expect(screen.queryByText("미스릴검")).toBeNull();
  expect(screen.getByText("철검")).toBeTruthy();
  fireEvent.change(input, { target: { value: "없는아이템" } });
  expect(screen.getByText(/검색 결과가 없습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: `${label} 초기화` }));
  expect(screen.getByText("미스릴검")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: "재료" }));
  expect(await screen.findByText(materialA.name)).toBeTruthy();
  fireEvent.change(input, { target: { value: materialA.name } });
  expect(screen.queryByText(materialB.name)).toBeNull();
  expect(screen.getByText(materialA.name)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "소모품" }));
  expect((input as HTMLInputElement).value).toBe(materialA.name);
  fireEvent.change(input, { target: { value: "sp" } });
  expect(screen.getByText(SP_FRUIT[1].name)).toBeTruthy();
  const requestCount = fetchMock.mock.calls.length;
  fireEvent.change(input, { target: { value: "없는소모품" } });
  expect(screen.queryByText(SP_FRUIT[1].name)).toBeNull();
  expect(screen.getByText(/검색 결과가 없습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: `${label} 초기화` }));
  expect(screen.getByText(SP_FRUIT[1].name)).toBeTruthy();
  expect(fetchMock.mock.calls.length).toBe(requestCount);
});

it("판매 재료 탭에서 농산물·씨앗 같은 생활 재료도 이름으로 검색한다", async () => {
  materials = { [materialA.id]: 12, "farm_item:strawberry": 5, "farm_item:sugarcane": 4, "farm_seed:wheat": 2 };
  render(<RewardToastProvider><V2MarketplaceView onBack={() => {}} /></RewardToastProvider>);
  fireEvent.click(screen.getByRole("button", { name: /판매.*아이템 올리기/ }));
  await screen.findByText("철검");
  fireEvent.click(screen.getByRole("tab", { name: "재료" }));
  expect(await screen.findByText("딸기")).toBeTruthy();
  const input = screen.getByRole("searchbox", { name: "판매 아이템 검색" });

  fireEvent.change(input, { target: { value: "딸기" } });
  expect(screen.getByText("딸기")).toBeTruthy();
  expect(screen.queryByText("사탕수수")).toBeNull();
  expect(screen.queryByText(materialA.name)).toBeNull();

  fireEvent.change(input, { target: { value: "수수" } });
  expect(screen.getByText("사탕수수")).toBeTruthy();
  expect(screen.queryByText("딸기")).toBeNull();

  fireEvent.change(input, { target: { value: "씨앗" } });
  expect(screen.getByText("밀 씨앗")).toBeTruthy();
});
