"use client";

import { useEffect, useState } from "react";
import { BellRinging, BellSlash, SpinnerGap } from "@phosphor-icons/react";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { BrowserPushSubscription } from "@/lib/push-notifications";

type PushState =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "off"
  | "on"
  | "busy"
  | "error";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Uint8Array(bytes.buffer);
}

function serializedSubscription(
  subscription: PushSubscription,
): BrowserPushSubscription | null {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) return null;
  return {
    endpoint: value.endpoint,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}

async function saveSubscription(subscription: PushSubscription) {
  const value = serializedSubscription(subscription);
  if (!value) throw new Error("invalid_subscription");
  const response = await fetch("/api/v2/push/subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error("subscription_save_failed");
}

export function PushNotificationSettings() {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (process.env.NODE_ENV !== "production") {
        if (alive) setState("unconfigured");
        return;
      }
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (alive) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setState("blocked");
        return;
      }
      try {
        const [keyResponse, registration] = await Promise.all([
          fetch("/api/v2/push/public-key", { cache: "no-store" }),
          navigator.serviceWorker.ready,
        ]);
        const keyJson = (await keyResponse.json()) as {
          enabled?: boolean;
          publicKey?: string;
        };
        if (!keyResponse.ok || !keyJson.enabled || !keyJson.publicKey) {
          if (alive) setState("unconfigured");
          return;
        }
        const subscription = await registration.pushManager.getSubscription();
        if (!alive) return;
        setPublicKey(keyJson.publicKey);
        setState(subscription ? "on" : "off");
        // 이미 허용한 브라우저는 로그인 계정 변경이나 DB 복구 뒤에도 서버 구독을 복원한다.
        if (subscription) void saveSubscription(subscription).catch(() => {});
      } catch {
        if (alive) setState("error");
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    if (!publicKey || state === "busy") return;
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey),
        }));
      await saveSubscription(subscription);
      setState("on");
    } catch {
      setState("error");
    }
  };

  const disable = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/v2/push/subscription", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("subscription_delete_failed");
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("error");
    }
  };

  const detail =
    state === "on"
      ? "농장·자동 벌목·자동 채광 완료, 길드, 협동 보스, 공지와 문의 답변을 알려드립니다."
      : state === "blocked"
        ? "기기에서 알림이 차단되어 있습니다. 앱 정보 또는 사이트 설정에서 알림을 허용해 주세요."
        : state === "unsupported"
          ? "이 브라우저 또는 기기에서는 푸시 알림을 지원하지 않습니다."
          : state === "unconfigured"
            ? "푸시 알림 서버를 준비 중입니다."
            : state === "error"
              ? "알림 설정을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "앱을 닫아도 주요 작업과 소식의 완료 알림을 받을 수 있습니다.";
  const disabled = ["loading", "busy", "unsupported", "unconfigured", "blocked"].includes(
    state,
  );

  return (
    <div className={`${SURFACE_INSET} flex items-start gap-3 p-3`}>
      {state === "on" ? (
        <BellRinging size={24} weight="duotone" className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
      ) : (
        <BellSlash size={24} weight="duotone" className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          푸시 알림
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={state === "on" ? disable : enable}
          aria-pressed={state === "on"}
          className="mt-3 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-amber-400 px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
        >
          {(state === "loading" || state === "busy") && (
            <SpinnerGap size={14} className="animate-spin" aria-hidden />
          )}
          {state === "on" ? "알림 끄기" : "알림 켜기"}
        </button>
      </div>
    </div>
  );
}
