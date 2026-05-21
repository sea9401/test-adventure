"use client";

import { useEffect, useRef, useState } from "react";
import {
  Barbell,
  CheckCircle,
  Coins,
  Hammer,
  Info,
  Package,
  Scroll,
  Skull,
  Sparkle,
  Sword,
  Tent,
  X,
} from "@phosphor-icons/react";
import type {
  AppNotification,
  NotificationKind,
  NotificationMeta,
} from "@/lib/notifications";
import { useToastPrefs } from "@/lib/notification-prefs";

const TOAST_DURATION_MS = 2000;
const MAX_VISIBLE_TOASTS = 3;

type ToastItem = {
  id: string;
  text: string;
  kind: NotificationKind;
  highlight?: NotificationMeta["highlight"];
};

// 메시지 안에서 highlight.name 부분만 className 으로 강조해 ReactNode 로 렌더.
// prefix 가 있으면 "prefix.text + name" 을 한 덩어리로 찾아 접두어는 prefix.className,
// 이름은 className 으로 따로 칠한다(접두어만 품질 색 / 이름은 rarity 색).
// 일치하는 부분이 없으면 plain text 그대로 반환. 토스트와 알림 패널 양쪽 공용.
export function renderHighlightedText(
  text: string,
  highlight: NotificationMeta["highlight"],
): React.ReactNode {
  if (!highlight) return text;
  const prefixText = highlight.prefix?.text ?? "";
  const full = prefixText + highlight.name;
  const idx = text.indexOf(full);
  if (idx < 0) {
    // prefix 포함 매칭 실패 시 name 단독으로 폴백(하위 호환).
    const i2 = text.indexOf(highlight.name);
    if (i2 < 0) return text;
    return (
      <>
        {text.slice(0, i2)}
        <span className={highlight.className}>{highlight.name}</span>
        {text.slice(i2 + highlight.name.length)}
      </>
    );
  }
  return (
    <>
      {text.slice(0, idx)}
      {highlight.prefix && (
        <span className={highlight.prefix.className}>{highlight.prefix.text}</span>
      )}
      <span className={highlight.className}>{highlight.name}</span>
      {text.slice(idx + full.length)}
    </>
  );
}

// 토스트 좌측 색띠 — 종류 한 눈에 구분.
const TOAST_ACCENT: Record<NotificationKind, string> = {
  battle_win: "bg-emerald-500",
  battle_lose: "bg-rose-500",
  training_done: "bg-amber-500",
  quest_ready: "bg-yellow-500",
  quest_complete: "bg-violet-500",
  milestone: "bg-fuchsia-500",
  expedition: "bg-teal-500",
  loot: "bg-lime-500",
  equip_drop: "bg-orange-500",
  item: "bg-blue-500",
  info: "bg-sky-500",
};

const TOAST_ICON: Record<NotificationKind, React.ComponentType<{ size?: number; weight?: "fill" | "duotone" | "regular" | "bold"; className?: string }>> = {
  battle_win: Sword,
  battle_lose: Skull,
  training_done: Barbell,
  quest_ready: Scroll,
  quest_complete: CheckCircle,
  milestone: Sparkle,
  expedition: Tent,
  loot: Coins,
  equip_drop: Package,
  item: Hammer,
  info: Info,
};

const TOAST_ICON_COLOR: Record<NotificationKind, string> = {
  battle_win: "text-emerald-600 dark:text-emerald-400",
  battle_lose: "text-rose-600 dark:text-rose-400",
  training_done: "text-amber-600 dark:text-amber-400",
  quest_ready: "text-yellow-600 dark:text-yellow-400",
  quest_complete: "text-violet-600 dark:text-violet-400",
  milestone: "text-fuchsia-600 dark:text-fuchsia-400",
  expedition: "text-teal-600 dark:text-teal-400",
  loot: "text-lime-600 dark:text-lime-400",
  equip_drop: "text-orange-600 dark:text-orange-400",
  item: "text-blue-600 dark:text-blue-400",
  info: "text-sky-600 dark:text-sky-400",
};

export function NotificationToast({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const initRef = useRef(false);
  const lastIdRef = useRef<string | null>(null);
  const { prefs } = useToastPrefs();
  // useEffect deps 안정화를 위한 ref — prefs 가 바뀐다고 옛 알림을 토스트로 띄우진 않음.
  // ref 할당은 render 중이 아닌 useEffect 안에서 (render 중 ref mutate 금지 규칙).
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  });

  // 신규 알림 감지 — 마운트 시점 이전 알림은 토스트 안 띄움.
  // 외부 props(notifications)를 관찰해 큐 누적 — set-state-in-effect 패턴이지만
  // 외부 변화 구독 케이스라 의도적.
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      lastIdRef.current = notifications[0]?.id ?? null;
      return;
    }
    if (notifications.length === 0) return;
    const latest = notifications[0];
    if (latest.id === lastIdRef.current) return;
    lastIdRef.current = latest.id;
    // 사용자 선호 — 해당 종류가 OFF 면 토스트 안 띄움.
    if (!prefsRef.current[latest.kind]) return;
    setToasts((prev) =>
      [
        ...prev,
        {
          id: latest.id,
          text: latest.text,
          kind: latest.kind,
          highlight: latest.meta?.highlight,
        },
      ].slice(-MAX_VISIBLE_TOASTS),
    );
  }, [notifications]);

  // 가장 오래된 토스트부터 자동 제거.
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, TOAST_DURATION_MS);
    return () => clearTimeout(id);
  }, [toasts]);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-50 flex flex-col items-end gap-2 sm:bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:right-6"
    >
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.kind];
        return (
        <div
          key={t.id}
          className="pointer-events-auto relative flex max-w-[calc(100vw-2rem)] items-start gap-2.5 overflow-hidden rounded-lg border border-zinc-200 bg-white py-3 pl-5 pr-2 text-base text-zinc-800 shadow-lg animate-in slide-in-from-bottom-2 sm:max-w-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 w-1.5 ${TOAST_ACCENT[t.kind]}`}
          />
          <Icon
            size={20}
            weight="duotone"
            className={`mt-0.5 shrink-0 ${TOAST_ICON_COLOR[t.kind]}`}
          />
          <span className="flex-1 pt-0.5">{renderHighlightedText(t.text, t.highlight)}</span>
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => dismiss(t.id)}
            className="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        );
      })}
    </div>
  );
}
