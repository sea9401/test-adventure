// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V2PreferencesView } from "./V2PreferencesView";

const mocks = vi.hoisted(() => ({
  updatePreferences: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./GameStateProvider", () => ({
  useGameIdentityState: () => ({ accountName: "테스터" }),
}));

vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({
    snapshot: {
      preferences: {
        version: 1,
        widgetOrder: [
          "character_summary",
          "stamina",
          "activity_checklist",
          "quest_rewards",
          "hot_time",
          "announcements",
          "bulletin_preview",
          "ranking_preview",
        ],
        hiddenWidgetIds: ["stamina"],
        characterExpanded: false,
        activityNotificationsEnabled: true,
        activityEnabled: { daily_hunt: true },
        seenUnlockedActivityIds: [],
      },
      activities: [
        {
          id: "daily_hunt",
          group: "daily",
          tab: "battle",
          title: "일일 사냥",
          detail: "오늘의 사냥 목표",
          href: "/hunt",
          state: "actionable",
          enabled: true,
          defaultEnabled: true,
        },
      ],
    },
    updatePreferences: mocks.updatePreferences,
  }),
}));

vi.mock("@/components/PushNotificationSettings", () => ({
  PushNotificationSettings: () => <div>푸시 알림</div>,
}));

vi.mock("@/components/safety/BlockedUsersPanel", () => ({
  BlockedUsersPanel: () => <div>차단 사용자</div>,
}));

afterEach(() => {
  cleanup();
  mocks.updatePreferences.mockClear();
});

describe("환경 설정 화면", () => {
  it("테마·표시 모드·푸시 알림·정책·회원 탈퇴를 한 화면에서 제공한다", () => {
    const { container } = render(<V2PreferencesView />);
    const html = container.innerHTML;

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
    expect(html).toContain('href="/game-info?from=game"');
    expect(html).toContain("게임 등급정보");
    expect(html).toContain("정책·약관");
    expect(html).toContain("회원 탈퇴 진행");
  });

  it("초기 선택 상태를 접근성 속성으로 표시한다", () => {
    const { container } = render(<V2PreferencesView />);
    const html = container.innerHTML;

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("홈 위젯의 순서와 표시 여부를 환경 설정에서 관리한다", () => {
    render(<V2PreferencesView />);

    expect(screen.getByRole("heading", { name: "홈 화면 구성" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "스태미나 표시" }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      hiddenWidgetIds: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "랭킹 위로 이동" }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      widgetOrder: [
        "character_summary",
        "stamina",
        "activity_checklist",
        "quest_rewards",
        "hot_time",
        "announcements",
        "ranking_preview",
        "bulletin_preview",
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "랭킹 숨기기" }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      hiddenWidgetIds: ["stamina", "ranking_preview"],
    });

    fireEvent.click(screen.getByRole("button", { name: "기본 배치로 되돌리기" }));
    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      widgetOrder: [
        "character_summary",
        "stamina",
        "activity_checklist",
        "quest_rewards",
        "hot_time",
        "announcements",
        "bulletin_preview",
        "ranking_preview",
      ],
      hiddenWidgetIds: ["stamina"],
    });
  });

  it("홈 체크 항목을 환경 설정에서 관리한다", () => {
    render(<V2PreferencesView />);

    expect(screen.getByRole("heading", { name: "체크 항목 관리" })).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /일일 사냥/ }));

    expect(mocks.updatePreferences).toHaveBeenCalledWith({
      activityEnabled: { daily_hunt: false },
    });
  });
  it("화면 스타일을 고르면 루트 클래스와 이 브라우저 저장값을 바꾼다", () => {
    document.documentElement.classList.remove("ui-skin-gilded");
    localStorage.removeItem("ui-style.v1");
    render(<V2PreferencesView />);

    expect(
      screen.getByRole("heading", { name: "화면 스타일" }),
    ).not.toBeNull();
    const classic = screen.getByRole("button", { name: /^클래식/ });
    const gilded = screen.getByRole("button", { name: /^금빛/ });
    expect(classic.getAttribute("aria-pressed")).toBe("true");
    expect(gilded.textContent).toContain("따뜻한 바탕, 명조 제목, 금색 버튼");

    fireEvent.click(gilded);
    expect(document.documentElement.classList.contains("ui-skin-gilded")).toBe(
      true,
    );
    expect(localStorage.getItem("ui-style.v1")).toBe("gilded");
    expect(gilded.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(classic);
    expect(document.documentElement.classList.contains("ui-skin-gilded")).toBe(
      false,
    );
    expect(localStorage.getItem("ui-style.v1")).toBe("classic");
    expect(classic.getAttribute("aria-pressed")).toBe("true");
  });
  it("사냥터 그림 표시를 끄고 켜면 루트 클래스와 이 브라우저 저장값을 바꾼다", () => {
    document.documentElement.classList.remove("ui-hunting-images-hidden");
    localStorage.removeItem("hunting-ground-images.v1");
    render(<V2PreferencesView />);

    const toggle = screen.getByRole("button", { name: "사냥터 그림 표시" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("ui-hunting-images-hidden")).toBe(true);
    expect(localStorage.getItem("hunting-ground-images.v1")).toBe("hidden");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("ui-hunting-images-hidden")).toBe(false);
    expect(localStorage.getItem("hunting-ground-images.v1")).toBeNull();
  });
  it("설정 카드 제목은 모두 공용 섹션 제목을 쓴다", () => {
    render(<V2PreferencesView />);

    for (const name of ["화면 테마", "화면 스타일", "알림", "배경 및 표시", "계정 및 안내"]) {
      const heading = screen.getByRole("heading", { name });
      expect(heading.className).toContain("ui-section-title");
    }
  });
});
