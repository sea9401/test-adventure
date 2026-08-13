import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DangerousFishingPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onBack: null as (() => void) | null,
  onOpenFishing: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/adventure/v2/DangerousFishingView", () => ({
  DangerousFishingView: ({
    onBack,
    onOpenFishing,
  }: {
    onBack: () => void;
    onOpenFishing: () => void;
  }) => {
    mocks.onBack = onBack;
    mocks.onOpenFishing = onOpenFishing;
    return <div>위험 해역 화면</div>;
  },
}));

vi.mock("@/adventure/v2/useDangerousFishing", () => ({
  useDangerousFishing: () => ({
    model: null,
    loading: true,
    busy: null,
    error: null,
  }),
}));

describe("DangerousFishingPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.onBack = null;
    mocks.onOpenFishing = null;
  });

  it("별도 위험 해역 화면과 기존 낚시 이동 경로를 연결한다", () => {
    expect(renderToStaticMarkup(<DangerousFishingPage />)).toContain(
      "위험 해역 화면",
    );
    mocks.onBack?.();
    expect(mocks.push).toHaveBeenCalledWith("/map");
    mocks.onOpenFishing?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing");
  });
});
