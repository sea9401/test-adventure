import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LifeWorkshopPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onBack: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/adventure/v2/LifeWorkshopView", () => ({
  LifeWorkshopView: ({ onBack }: { onBack: () => void }) => {
    mocks.onBack = onBack;
    return <div>생활 조합 작업장</div>;
  },
}));

describe("LifeWorkshopPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.onBack = null;
  });

  it("가공 탭을 포함한 작업장 뒤로가기는 마을로 이동한다", () => {
    renderToStaticMarkup(<LifeWorkshopPage />);

    expect(mocks.onBack).toBeTypeOf("function");
    mocks.onBack?.();

    expect(mocks.push).toHaveBeenCalledWith("/town");
  });
});
