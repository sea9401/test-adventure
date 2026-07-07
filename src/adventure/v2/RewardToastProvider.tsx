"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type RewardToastTone = "reward" | "success" | "error" | "info";

type RewardToastInput = {
  title: string;
  detail?: string;
  tone?: RewardToastTone;
};

type RewardToast = Required<RewardToastInput> & {
  id: number;
};

type RewardToastContextValue = {
  notify: (toast: RewardToastInput) => void;
  notifySystem: (message: string, tone?: RewardToastTone) => void;
  notifyReward: (title: string, detail?: string) => void;
};

const noopContext: RewardToastContextValue = {
  notify: () => {},
  notifySystem: () => {},
  notifyReward: () => {},
};

const RewardToastContext =
  createContext<RewardToastContextValue>(noopContext);

const TONE_CLASS: Record<RewardToastTone, string> = {
  reward:
    "border-amber-200 bg-amber-50 text-amber-950 shadow-amber-900/10 dark:border-amber-700/70 dark:bg-amber-950 dark:text-amber-50",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-950 shadow-emerald-900/10 dark:border-emerald-700/70 dark:bg-emerald-950 dark:text-emerald-50",
  error:
    "border-rose-200 bg-rose-50 text-rose-950 shadow-rose-900/10 dark:border-rose-700/70 dark:bg-rose-950 dark:text-rose-50",
  info:
    "border-sky-200 bg-sky-50 text-sky-950 shadow-sky-900/10 dark:border-sky-700/70 dark:bg-sky-950 dark:text-sky-50",
};

const TONE_MARK: Record<RewardToastTone, string> = {
  reward: "보상",
  success: "완료",
  error: "실패",
  info: "알림",
};

export function RewardToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<RewardToast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, detail = "", tone = "reward" }: RewardToastInput) => {
      const cleanTitle = title.trim();
      const cleanDetail = detail.trim();
      if (!cleanTitle && !cleanDetail) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const toast: RewardToast = {
        id,
        title: cleanTitle || cleanDetail,
        detail: cleanTitle ? cleanDetail : "",
        tone,
      };
      setToasts((prev) => [toast, ...prev].slice(0, 3));
      window.setTimeout(() => dismiss(id), 4600);
    },
    [dismiss],
  );

  const notifyReward = useCallback(
    (title: string, detail?: string) => notify({ title, detail, tone: "reward" }),
    [notify],
  );

  const notifySystem = useCallback(
    (message: string, tone?: RewardToastTone) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const inferredTone =
        tone ??
        (trimmed.startsWith("✗")
          ? "error"
          : trimmed.startsWith("✓")
            ? "success"
            : "info");
      const text = trimmed.replace(/^[✓✗]\s*/, "");
      const [title, ...detailParts] = text.split(/\s+—\s+/);
      notify({
        title: title.trim(),
        detail: detailParts.join(" — ").trim(),
        tone: inferredTone,
      });
    },
    [notify],
  );

  const value = useMemo(
    () => ({ notify, notifySystem, notifyReward }),
    [notify, notifySystem, notifyReward],
  );

  return (
    <RewardToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:left-5 sm:bottom-5 sm:w-[23rem]"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto ui-reward-toast rounded-md border px-3 py-2 shadow-lg backdrop-blur ${TONE_CLASS[toast.tone]}`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0 rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-black/20">
                {TONE_MARK[toast.tone]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-5">
                  {toast.title}
                </div>
                {toast.detail ? (
                  <div className="mt-0.5 text-xs leading-4 opacity-80">
                    {toast.detail}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 rounded px-1 text-sm leading-5 opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </RewardToastContext.Provider>
  );
}

export function useRewardToast() {
  return useContext(RewardToastContext);
}

export function useSystemToast() {
  const { notify, notifySystem } = useContext(RewardToastContext);
  return { notify, notifySystem };
}

export function useSystemMessageState(initial: string | null = null) {
  const [message, setMessageState] = useState<string | null>(initial);
  const { notifySystem } = useSystemToast();
  const setMessage = useCallback(
    (next: string | null) => {
      setMessageState(next);
      if (next) notifySystem(next);
    },
    [notifySystem],
  );
  return [message, setMessage] as const;
}
