import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityVerificationTestSectionView } from "./ActivityVerificationTestSection";

describe("ActivityVerificationTestSectionView", () => {
  it("활동과 확인 단계를 고르고 다음 행동에 표시할 수 있게 안내한다", () => {
    const html = renderToStaticMarkup(
      <ActivityVerificationTestSectionView
        activity="fishing"
        mode="captcha"
        status={{
          turnstileConfigured: true,
          captchaConfigured: true,
          requests: { fishing: null, woodcutting: null, mining: null },
        }}
        readOnly={false}
        busy={false}
        error={null}
        onActivityChange={vi.fn()}
        onModeChange={vi.fn()}
        onRequire={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("사람 확인 테스트");
    expect(html).toContain("낚시");
    expect(html).toContain("벌목");
    expect(html).toContain("채광");
    expect(html).toContain("일반 확인");
    expect(html).toContain("2단계 hCaptcha");
    expect(html).toContain("다음 행동에 표시");
    expect(html).toContain("tab=lifeGathering");
  });

  it("활성 요청과 만료 시각을 보여주고 읽기 전용이면 변경을 막는다", () => {
    const html = renderToStaticMarkup(
      <ActivityVerificationTestSectionView
        activity="woodcutting"
        mode="standard"
        status={{
          turnstileConfigured: true,
          captchaConfigured: true,
          requests: {
            fishing: null,
            woodcutting: {
              mode: "standard",
              requestedAt: Date.parse("2026-08-13T00:00:00.000Z"),
              expiresAt: Date.parse("2026-08-13T00:10:00.000Z"),
            },
            mining: null,
          },
        }}
        readOnly
        busy={false}
        error={null}
        onActivityChange={vi.fn()}
        onModeChange={vi.fn()}
        onRequire={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("벌목 · 일반 확인");
    expect(html).toContain("요청 취소");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("hCaptcha 미설정 상태를 알리고 2단계 요청 버튼을 비활성화한다", () => {
    const html = renderToStaticMarkup(
      <ActivityVerificationTestSectionView
        activity="mining"
        mode="captcha"
        status={{
          turnstileConfigured: true,
          captchaConfigured: false,
          requests: { fishing: null, woodcutting: null, mining: null },
        }}
        readOnly={false}
        busy={false}
        error={null}
        onActivityChange={vi.fn()}
        onModeChange={vi.fn()}
        onRequire={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toContain("hCaptcha가 설정되지 않았습니다");
    expect(html).toContain("disabled=\"\"");
  });
});
