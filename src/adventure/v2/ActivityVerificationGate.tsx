"use client";

import Script from "next/script";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import {
  activityVerificationGateReducer,
  initialActivityVerificationGateState,
} from "./activityVerificationGateState";
import type {
  ActivityVerificationChallenge,
  ActivityVerificationSubmission,
} from "./useActivityVerification";

const WIDGET_WAIT_TIMEOUT_MS = 30_000;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      retry: "never";
      "refresh-expired": "manual";
      "refresh-timeout": "manual";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "unsupported-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

type HCaptchaApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "light";
      size: "normal";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    hcaptcha?: HCaptchaApi;
  }
}

export function ActivityVerificationGate({
  challenge,
  onVerify,
}: {
  challenge: ActivityVerificationChallenge;
  onVerify: (submission: ActivityVerificationSubmission) => Promise<boolean>;
}) {
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<string | null>(null);
  const captchaWidgetRef = useRef<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [gateState, dispatchGate] = useReducer(
    activityVerificationGateReducer,
    initialActivityVerificationGateState,
  );
  const { status, widgetGeneration } = gateState;
  const needsScriptReload =
    !turnstileReady || Boolean(challenge.captchaSiteKey && !captchaReady);

  useEffect(() => {
    // Do not limit time spent solving the additional interactive CAPTCHA or
    // waiting for server verification (which has its own request timeout).
    if (status !== "ready" || (turnstileToken && captchaReady)) return;
    const timeout = window.setTimeout(
      () => dispatchGate({ type: "failure" }),
      WIDGET_WAIT_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [captchaReady, status, turnstileToken, widgetGeneration]);

  const removeWidgets = useCallback(() => {
    const turnstileWidget = turnstileWidgetRef.current;
    if (turnstileWidget && window.turnstile) {
      window.turnstile.remove(turnstileWidget);
    }
    turnstileWidgetRef.current = null;
    const captchaWidget = captchaWidgetRef.current;
    if (captchaWidget && window.hcaptcha) {
      window.hcaptcha.remove(captchaWidget);
    }
    captchaWidgetRef.current = null;
  }, []);

  const submit = useCallback(
    (submission: ActivityVerificationSubmission) => {
      dispatchGate({ type: "submit" });
      void onVerify(submission)
        .then((ok) => {
          if (ok) return;
          dispatchGate({ type: "failure" });
        })
        .catch(() => {
          dispatchGate({ type: "failure" });
        });
    },
    [onVerify],
  );

  const retry = useCallback(() => {
    setTurnstileToken(null);
    dispatchGate({ type: "retry" });
  }, []);

  const renderTurnstile = useCallback(() => {
    const container = turnstileContainerRef.current;
    const turnstile = window.turnstile;
    if (!container || !turnstile || turnstileWidgetRef.current) return;
    turnstileWidgetRef.current = turnstile.render(container, {
      sitekey: challenge.siteKey,
      action: `activity_${challenge.activity}`,
      theme: "auto",
      size: "flexible",
      retry: "never",
      "refresh-expired": "manual",
      "refresh-timeout": "manual",
      callback: (token) => {
        if (challenge.captchaSiteKey) {
          setTurnstileToken(token);
          return;
        }
        submit({ turnstileToken: token });
      },
      "error-callback": () => dispatchGate({ type: "failure" }),
      "timeout-callback": () => dispatchGate({ type: "failure" }),
      "unsupported-callback": () => dispatchGate({ type: "failure" }),
      "expired-callback": () => {
        setTurnstileToken(null);
        dispatchGate({ type: "failure" });
      },
    });
  }, [challenge.activity, challenge.captchaSiteKey, challenge.siteKey, submit]);

  const renderCaptcha = useCallback(() => {
    const container = captchaContainerRef.current;
    const captcha = window.hcaptcha;
    if (
      !container ||
      !captcha ||
      !challenge.captchaSiteKey ||
      !turnstileToken ||
      captchaWidgetRef.current
    ) {
      return;
    }
    captchaWidgetRef.current = captcha.render(container, {
      sitekey: challenge.captchaSiteKey,
      theme: "light",
      size: "normal",
      callback: (captchaToken) => {
        submit({ turnstileToken, captchaToken });
      },
      "error-callback": () => dispatchGate({ type: "failure" }),
      "expired-callback": () => dispatchGate({ type: "failure" }),
    });
  }, [challenge.captchaSiteKey, submit, turnstileToken]);

  useEffect(() => {
    if (turnstileReady) renderTurnstile();
    return () => {
      removeWidgets();
    };
  }, [removeWidgets, renderTurnstile, turnstileReady, widgetGeneration]);

  useEffect(() => {
    if (captchaReady && turnstileToken) renderCaptcha();
    return () => {
      const widgetId = captchaWidgetRef.current;
      if (widgetId && window.hcaptcha) window.hcaptcha.remove(widgetId);
      captchaWidgetRef.current = null;
    };
  }, [captchaReady, renderCaptcha, turnstileToken, widgetGeneration]);

  return (
    <div className={`${SURFACE_ACCENT} space-y-3 p-4 text-center`}>
      <Script
        id="activity-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setTurnstileReady(true)}
        onError={() => dispatchGate({ type: "failure" })}
      />
      {challenge.captchaSiteKey ? (
        <Script
          id="activity-hcaptcha"
          src="https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off"
          strategy="afterInteractive"
          onReady={() => setCaptchaReady(true)}
          onError={() => dispatchGate({ type: "failure" })}
        />
      ) : null}
      <div>
        <div className="font-bold text-amber-900 dark:text-amber-100">
          잠시 사람 확인이 필요합니다
        </div>
        <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
          {challenge.manualTest
            ? challenge.captchaSiteKey
              ? "보안 확인을 위해 2단계 사람 확인을 진행합니다. 완료하면 바로 계속할 수 있습니다."
              : "보안 확인을 위해 사람 확인을 진행합니다. 완료하면 바로 계속할 수 있습니다."
            : challenge.captchaSiteKey
            ? "자동화 의심 신호가 반복되어 2단계 확인을 진행합니다. 완료하면 바로 계속할 수 있습니다."
            : "장시간 반복 활동을 보호하기 위한 확인입니다. 완료하면 바로 계속할 수 있습니다."}
        </p>
      </div>
      <div ref={turnstileContainerRef} className="mx-auto min-h-16 w-full" />
      {challenge.captchaSiteKey && turnstileToken ? (
        <div className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-800">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            1단계가 완료되었습니다. 아래 추가 CAPTCHA를 완료해 주세요.
          </p>
          <div ref={captchaContainerRef} className="mx-auto min-h-20 w-fit max-w-full" />
        </div>
      ) : null}
      {status === "checking" ? (
        <Button disabled size="sm" fullWidth>
          확인 중…
        </Button>
      ) : status === "error" ? (
        <div role="alert" className="space-y-2">
          <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
            사람 확인이 지연되거나 완료되지 않았습니다. 아래 버튼을 눌러 다시
            시도해 주세요.
          </p>
          <p className="text-xs leading-5 text-amber-800 dark:text-amber-200">
            인증은 이 화면에서 진행되며 별도 팝업은 필요하지 않습니다. 계속
            멈춘다면 이 사이트의 콘텐츠 차단 설정을 확인하거나, 최신 Chrome
            브라우저에서 접속해 주세요. Wi-Fi와 모바일 데이터를 바꿔 시도하는
            것도 도움이 될 수 있습니다.
          </p>
          {needsScriptReload ? (
            <Button
              type="button"
              size="sm"
              fullWidth
              onClick={() => window.location.reload()}
            >
              페이지 새로고침
            </Button>
          ) : (
            <Button type="button" size="sm" fullWidth onClick={retry}>
              사람 확인 다시 시도
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
