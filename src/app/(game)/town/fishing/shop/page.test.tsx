import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FishingShopPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onOpenDangerous: null as (() => void) | null,
  initialTab: null as "regular" | "dangerous" | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => ({
    get: (key: string) => (key === "tab" ? "dangerous" : null),
  }),
}));

vi.mock("@/adventure/v2/FishingShopPanel", () => ({
  FishingShopPanel: ({
    onOpenDangerous,
    initialTab,
  }: {
    onOpenDangerous: () => void;
    initialTab: "regular" | "dangerous";
  }) => {
    mocks.onOpenDangerous = onOpenDangerous;
    mocks.initialTab = initialTab;
    return <div>낚시 상점 화면</div>;
  },
}));

describe("FishingShopPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.onOpenDangerous = null;
    mocks.initialTab = null;
  });

  it("위험 해역 링크로 들어오면 전용 탭을 열고 위험 해역 복귀 경로를 연결한다", () => {
    expect(renderToStaticMarkup(<FishingShopPage />)).toContain("낚시 상점 화면");
    expect(mocks.initialTab).toBe("dangerous");
    mocks.onOpenDangerous?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/dangerous");
  });
});
