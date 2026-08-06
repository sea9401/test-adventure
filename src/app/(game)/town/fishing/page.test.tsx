import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FishingPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  onBack: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("spot=village_pier"),
}));

vi.mock("@/adventure/v2/FishingPanel", () => ({
  FishingPanel: ({ onBack }: { onBack: () => void }) => {
    mocks.onBack = onBack;
    return <div>낚시 화면</div>;
  },
}));

describe("FishingPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.onBack = null;
  });

  it("낚시 화면에서 뒤로가면 생활지도로 이동한다", () => {
    renderToStaticMarkup(<FishingPage />);

    expect(mocks.onBack).toBeTypeOf("function");
    mocks.onBack?.();

    expect(mocks.push).toHaveBeenCalledWith("/map");
  });
});
