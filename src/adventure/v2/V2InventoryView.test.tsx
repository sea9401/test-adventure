import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { V2InventoryView } from "./V2InventoryView";

const mocks = vi.hoisted(() => ({
  onUseSpFruit: null as ((tier: 1 | 2 | 3 | 4) => Promise<void>) | null,
  onUseMasteryCertificate: null as (() => void) | null,
  masteryCertificates: null as number | null,
  certificateModalOpen: null as boolean | null,
  notifySystem: vi.fn(),
  refreshGameState: vi.fn(async () => {}),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    // 서버 정적 렌더에서도 소모품 탭을 그려 실제 사용 콜백을 확보한다.
    useState: (initial: unknown) =>
      actual.useState(initial === true ? false : initial),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=consumable"),
}));

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useEquipmentCodexContext: () => null,
  useGameState: () => ({
    frontierDepth: 0,
    refreshGameState: mocks.refreshGameState,
    setGold: vi.fn(),
  }),
}));

vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: mocks.notifySystem }),
}));

vi.mock("./inventory/RareMapsTab", () => ({
  RareMapsTab: ({
    onUseSpFruit,
    onUseMasteryCertificate,
    masteryCertificates,
  }: {
    onUseSpFruit: (tier: 1 | 2 | 3 | 4) => Promise<void>;
    onUseMasteryCertificate: () => void;
    masteryCertificates: number;
  }) => {
    mocks.onUseSpFruit = onUseSpFruit;
    mocks.onUseMasteryCertificate = onUseMasteryCertificate;
    mocks.masteryCertificates = masteryCertificates;
    return <div>소모품</div>;
  },
}));

vi.mock("./MasteryCertificateUseModal", () => ({
  MasteryCertificateUseModal: ({ open }: { open: boolean }) => {
    mocks.certificateModalOpen = open;
    return null;
  },
}));

describe("SP 열매 사용 상태 동기화", () => {
  beforeEach(() => {
    mocks.onUseSpFruit = null;
    mocks.onUseMasteryCertificate = null;
    mocks.masteryCertificates = null;
    mocks.certificateModalOpen = null;
    mocks.notifySystem.mockClear();
    mocks.refreshGameState.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/v2/me/use-sp-fruit")) {
          return Response.json({ ok: true, spBudget: 14 });
        }
        if (url.endsWith("/api/v2/me/inventory")) {
          return Response.json({
            ok: true,
            materials: {},
            spFruitUsed: { 1: 0, 2: 0, 3: 3, 4: 0 },
            masteryCertificates: 10,
          });
        }
        if (url.endsWith("/api/v2/me/equipment")) {
          return Response.json({ ok: true, owned: [], equipped: {} });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("성공 후 스킬 화면의 SP 열매 보너스도 새로고침한다", async () => {
    renderToStaticMarkup(<V2InventoryView onBack={vi.fn()} />);

    expect(mocks.onUseSpFruit).toBeTypeOf("function");
    await mocks.onUseSpFruit?.(3);

    expect(mocks.refreshGameState).toHaveBeenCalledOnce();
  });

  it("숙련 증서 보유 수량과 공용 사용 모달을 소모품 탭에 연결한다", () => {
    renderToStaticMarkup(<V2InventoryView onBack={vi.fn()} />);

    expect(mocks.onUseMasteryCertificate).toBeTypeOf("function");
    expect(mocks.masteryCertificates).toBe(0);
    expect(mocks.certificateModalOpen).toBe(false);
  });
});
