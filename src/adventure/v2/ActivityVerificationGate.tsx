"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ActivityVerificationChallenge } from "./useActivityVerification";

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

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function ActivityVerificationGate({
  challenge,
  onVerify,
}: {
  challenge: ActivityVerificationChallenge;
  onVerify: (token: string) => Promise<boolean>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<"ready" | "checking" | "error">("ready");

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    const turnstile = window.turnstile;
    if (!container || !turnstile || widgetIdRef.current) return;
    widgetIdRef.current = turnstile.render(container, {
      sitekey: challenge.siteKey,
      action: `activity_${challenge.activity}`,
      theme: "auto",
      size: "flexible",
      callback: (token) => {
        setStatus("checking");
        void onVerify(token)
          .then((ok) => {
            if (ok) return;
            setStatus("error");
            const widgetId = widgetIdRef.current;
            if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
          })
          .catch(() => {
            setStatus("error");
            const widgetId = widgetIdRef.current;
            if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
          });
      },
      "error-callback": () => setStatus("error"),
      "expired-callback": () => setStatus("ready"),
    });
  }, [challenge.activity, challenge.siteKey, onVerify]);

  useEffect(() => {
    if (scriptReady) renderWidget();
    return () => {
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [renderWidget, scriptReady]);

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950/40">
      <Script
        id="activity-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setStatus("error")}
      />
      <div>
        <div className="font-bold text-amber-900 dark:text-amber-100">잠시 사람 확인이 필요합니다</div>
        <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-200">
          장시간 반복 활동을 보호하기 위한 확인입니다. 완료하면 바로 계속할 수 있습니다.
        </p>
      </div>
      <div ref={containerRef} className="mx-auto min-h-16 w-full" />
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
