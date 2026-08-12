"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type {
  ActivityVerificationChallenge,
  ActivityVerificationSubmission,
} from "./useActivityVerification";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
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
  const [status, setStatus] = useState<"ready" | "checking" | "error">("ready");

  const resetWidgets = useCallback(() => {
    setTurnstileToken(null);
    const turnstileWidget = turnstileWidgetRef.current;
    if (turnstileWidget && window.turnstile) {
      window.turnstile.reset(turnstileWidget);
    }
    const captchaWidget = captchaWidgetRef.current;
    if (captchaWidget && window.hcaptcha) {
      window.hcaptcha.remove(captchaWidget);
    }
    captchaWidgetRef.current = null;
  }, []);

  const submit = useCallback(
    (submission: ActivityVerificationSubmission) => {
      setStatus("checking");
      void onVerify(submission)
        .then((ok) => {
          if (ok) return;
          setStatus("error");
          resetWidgets();
        })
        .catch(() => {
          setStatus("error");
          resetWidgets();
        });
    },
    [onVerify, resetWidgets],
  );

  const renderTurnstile = useCallback(() => {
    const container = turnstileContainerRef.current;
    const turnstile = window.turnstile;
    if (!container || !turnstile || turnstileWidgetRef.current) return;
    turnstileWidgetRef.current = turnstile.render(container, {
      sitekey: challenge.siteKey,
      action: `activity_${challenge.activity}`,
      theme: "auto",
      size: "flexible",
      callback: (token) => {
        setStatus("ready");
        if (challenge.captchaSiteKey) {
          setTurnstileToken(token);
          return;
        }
        submit({ turnstileToken: token });
      },
      "error-callback": () => setStatus("error"),
      "expired-callback": () => {
        setTurnstileToken(null);
        setStatus("ready");
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
      "error-callback": () => setStatus("error"),
      "expired-callback": () => setStatus("ready"),
    });
  }, [challenge.captchaSiteKey, submit, turnstileToken]);

  useEffect(() => {
    if (turnstileReady) renderTurnstile();
    return () => {
      const widgetId = turnstileWidgetRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      turnstileWidgetRef.current = null;
    };
  }, [renderTurnstile, turnstileReady]);

  useEffect(() => {
    if (captchaReady && turnstileToken) renderCaptcha();
    return () => {
      const widgetId = captchaWidgetRef.current;
      if (widgetId && window.hcaptcha) window.hcaptcha.remove(widgetId);
      captchaWidgetRef.current = null;
    };
  }, [captchaReady, renderCaptcha, turnstileToken]);

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950/40">
      <Script
        id="activity-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setTurnstileReady(true)}
        onError={() => setStatus("error")}
      />
      {challenge.captchaSiteKey ? (
        <Script
          id="activity-hcaptcha"
          src="https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off"
          strategy="afterInteractive"
          onReady={() => setCaptchaReady(true)}
          onError={() => setStatus("error")}
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
        <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
          확인을 완료하지 못했습니다. 위젯을 다시 시도해 주세요.
        </p>
      ) : null}
    </div>
  );
}
