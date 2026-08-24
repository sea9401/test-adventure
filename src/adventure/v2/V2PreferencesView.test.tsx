import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { V2PreferencesView } from "./V2PreferencesView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({ accountName: "테스터" }),
}));

vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({
    snapshot: {
      preferences: { activityNotificationsEnabled: true },
    },
    updatePreferences: vi.fn(),
  }),
}));

describe("환경 설정 화면", () => {
  it("테마·표시 모드·푸시 알림·정책·회원 탈퇴를 한 화면에서 제공한다", () => {
    const html = renderToStaticMarkup(<V2PreferencesView />);

    expect(html).toContain("환경 설정");
    expect(html).toContain("라이트 모드");
    expect(html).toContain("다크 모드");
    expect(html).toContain("기본 모드");
    expect(html).toContain("배경 숨김");
    expect(html).toContain("은신 모드");
    expect(html).toContain("터미널 모드");
    expect(html).toContain("푸시 알림");
    expect(html).toContain("콘텐츠 알림 표시");
    expect(html).toContain('aria-label="콘텐츠 알림 표시"');
    expect(html).toContain("검은 화면");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("정책·약관");
    expect(html).toContain("회원 탈퇴 진행");
  });

  it("초기 선택 상태를 접근성 속성으로 표시한다", () => {
    const html = renderToStaticMarkup(<V2PreferencesView />);

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});
