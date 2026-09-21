// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ScriptProps } from "next/script";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityVerificationGate } from "./ActivityVerificationGate";
import type { ActivityVerificationChallenge } from "./useActivityVerification";

const scripts = vi.hoisted(() => ({
  blocked: new Set<string>(),
  props: new Map<string, ScriptProps>(),
}));

// Next owns loading/caching; tests control only the external script lifecycle.
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: function MockScript(props: ScriptProps) {
      const { id, onReady } = props;
      scripts.props.set(id!, props);
      useEffect(() => {
        if (!scripts.blocked.has(id!)) onReady?.();
      }, [id, onReady]);
      return null;
    },
  };
});

type TurnstileOptions = Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
type CaptchaOptions = Parameters<NonNullable<Window["hcaptcha"]>["render"]>[1];

const challenge: ActivityVerificationChallenge = {
  activity: "fishing",
  siteKey: "turnstile-site",
  captchaSiteKey: null,
  reason: "volume",
  manualTest: false,
};
let turnstileOptions: TurnstileOptions;
let captchaOptions: CaptchaOptions;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  scripts.blocked.clear();
  scripts.props.clear();
  let generation = 0;
  window.turnstile = {
    render: vi.fn((_container, options) => {
      turnstileOptions = options;
      return `turnstile-${++generation}`;
    }),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  window.hcaptcha = {
    render: vi.fn((_container, options) => {
      captchaOptions = options;
      return "captcha-1";
    }),
    remove: vi.fn(),
    reset: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.turnstile;
  delete window.hcaptcha;
});

describe("ActivityVerificationGate recovery", () => {
  it("무응답 30초 뒤 복구 경로를 제공하고 수동 재시도한 새 토큰을 제출한다", async () => {
    const onVerify = vi.fn().mockResolvedValue(true);
    render(<ActivityVerificationGate challenge={challenge} onVerify={onVerify} />);
    await advance(29_999);
    expect(screen.queryByRole("button", { name: "사람 확인 다시 시도" })).toBeNull();
    await advance(1);
    expect(screen.getByRole("alert").textContent).toContain("팝업");
    expect(onVerify).not.toHaveBeenCalled();
    expect(window.turnstile!.render).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "사람 확인 다시 시도" }));
    expect(window.turnstile!.remove).toHaveBeenCalledWith("turnstile-1");
    expect(window.turnstile!.render).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { turnstileOptions.callback("fresh-token"); });
    expect(onVerify).toHaveBeenCalledExactlyOnceWith({ turnstileToken: "fresh-token" });
    await advance(30_000);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("스크립트가 응답 없이 로드되지 않으면 새로고침을 제공한다", async () => {
    scripts.blocked.add("activity-turnstile");
    delete window.turnstile;
    render(<ActivityVerificationGate challenge={challenge} onVerify={vi.fn()} />);
    await advance(30_000);
    expect(screen.getByRole("button", { name: "페이지 새로고침" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "사람 확인 다시 시도" })).toBeNull();
  });

  it("스크립트 로드 오류도 새로고침으로 복구하도록 안내한다", () => {
    scripts.blocked.add("activity-turnstile");
    delete window.turnstile;
    render(<ActivityVerificationGate challenge={challenge} onVerify={vi.fn()} />);
    act(() => { scripts.props.get("activity-turnstile")!.onError?.(new Error("offline")); });
    expect(screen.getByRole("button", { name: "페이지 새로고침" })).toBeDefined();
  });

  it.each(["timeout-callback", "unsupported-callback"] as const)(
    "%s 발생 시 즉시 재시도를 안내한다",
    (callback) => {
      render(<ActivityVerificationGate challenge={challenge} onVerify={vi.fn()} />);
      act(() => { turnstileOptions[callback](); });
      expect(screen.getByRole("button", { name: "사람 확인 다시 시도" })).toBeDefined();
    },
  );

  it("수동 재시도 뒤에도 새 시도가 멈추면 다시 복구 경로를 제공한다", async () => {
    render(<ActivityVerificationGate challenge={challenge} onVerify={vi.fn()} />);
    await advance(30_000);
    fireEvent.click(screen.getByRole("button", { name: "사람 확인 다시 시도" }));
    await advance(30_000);
    expect(screen.getByRole("button", { name: "사람 확인 다시 시도" })).toBeDefined();
  });

  it("지연 안내 이후에도 기존 위젯에서 정상 토큰이 오면 제출한다", async () => {
    const onVerify = vi.fn().mockResolvedValue(true);
    render(<ActivityVerificationGate challenge={challenge} onVerify={onVerify} />);
    await advance(30_000);
    expect(screen.getByRole("alert")).toBeDefined();
    await act(async () => { turnstileOptions.callback("late-token"); });
    expect(onVerify).toHaveBeenCalledExactlyOnceWith({ turnstileToken: "late-token" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.turnstile!.remove).not.toHaveBeenCalled();
  });

  it("추가 CAPTCHA를 푸는 동안에는 30초 타이머가 방해하지 않는다", async () => {
    const onVerify = vi.fn().mockResolvedValue(true);
    render(<ActivityVerificationGate challenge={{ ...challenge, captchaSiteKey: "captcha-site" }} onVerify={onVerify} />);
    await advance(25_000);
    await act(async () => { turnstileOptions.callback("first-token"); });
    await advance(60_000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onVerify).not.toHaveBeenCalled();
    await act(async () => { captchaOptions.callback("second-token"); });
    expect(onVerify).toHaveBeenCalledExactlyOnceWith({ turnstileToken: "first-token", captchaToken: "second-token" });
  });

  it("추가 CAPTCHA 스크립트도 로드되지 않으면 새로고침을 제공한다", async () => {
    scripts.blocked.add("activity-hcaptcha");
    delete window.hcaptcha;
    render(<ActivityVerificationGate challenge={{ ...challenge, captchaSiteKey: "captcha-site" }} onVerify={vi.fn()} />);
    await act(async () => { turnstileOptions.callback("first-token"); });
    await advance(30_000);
    expect(screen.getByRole("button", { name: "페이지 새로고침" })).toBeDefined();
  });

  it("서버 확인 중에는 위젯 대기 제한이 적용되지 않는다", async () => {
    render(<ActivityVerificationGate challenge={challenge} onVerify={() => new Promise(() => {})} />);
    await advance(29_000);
    act(() => { turnstileOptions.callback("token"); });
    await advance(30_000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "확인 중…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("화면을 떠나면 대기 타이머를 정리한다", () => {
    const { unmount } = render(<ActivityVerificationGate challenge={challenge} onVerify={vi.fn()} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
