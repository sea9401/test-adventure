import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query.value),
}));
vi.mock("@/adventure/v2/V2EnhanceView", () => ({
  V2EnhanceView: (props: { initialMode?: string; initialItemIid?: string }) => (
    <div data-mode={props.initialMode} data-item={props.initialItemIid} />
  ),
}));

import SmithyPage from "./page";

describe("대장간 딥링크", () => {
  beforeEach(() => {
    query.value = "";
  });

  it("해방 모드와 대상 장비 iid를 작업대에 전달한다", () => {
    query.value = "mode=liberation&item=eq_target";
    const html = renderToStaticMarkup(<SmithyPage />);
    expect(html).toContain('data-mode="liberation"');
    expect(html).toContain('data-item="eq_target"');
  });

  it("알 수 없는 모드는 대장간 기본 모드로 둔다", () => {
    query.value = "mode=unknown&item=eq_target";
    const html = renderToStaticMarkup(<SmithyPage />);
    expect(html).not.toContain("data-mode");
  });
});
