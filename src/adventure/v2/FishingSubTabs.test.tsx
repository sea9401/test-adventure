// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FishingSubTabs } from "./FishingSubTabs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tabs = (fishingLevel?: number | null) => (
  <FishingSubTabs
    active="fishing"
    fishingLevel={fishingLevel}
    onOpenFishing={vi.fn()}
    onOpenDangerous={vi.fn()}
    onOpenShop={vi.fn()}
  />
);

describe("낚시 메뉴 위험 해역 잠금 표시", () => {
  it("낚시 15레벨 전에는 위험 해역 탭에 자물쇠와 해금 레벨을 붙인다", () => {
    const html = renderToStaticMarkup(tabs(3));

    expect(html).toContain("위험 해역 Lv 15");
    expect(html).toMatch(/<svg[\s\S]*?<span>위험 해역 Lv 15<\/span>/);
  });

  it("15레벨부터와 레벨을 아직 모를 때는 그대로 둔다", () => {
    expect(renderToStaticMarkup(tabs(15))).not.toContain("Lv 15");
    expect(renderToStaticMarkup(tabs(null))).not.toContain("Lv 15");
  });

  it("레벨을 받지 못한 화면은 낚시 진행도를 한 번 읽어 잠금을 표시한다", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ ok: true, progression: { level: 4 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(tabs(undefined));

    expect(await screen.findByRole("tab", { name: "위험 해역 Lv 15" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/v2/fishing/progression");
  });

  it("레벨을 받은 화면은 따로 읽지 않는다", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(tabs(20));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
