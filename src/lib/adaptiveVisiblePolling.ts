export type AdaptivePollOutcome = "changed" | "unchanged" | "failed";

type AdaptiveVisiblePollingOptions = {
  task: () => Promise<AdaptivePollOutcome>;
  delayMs: (consecutiveUnchangedPolls: number) => number;
  runImmediately?: boolean;
  refreshOnFocus?: boolean;
};

function pageIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export function startAdaptiveVisiblePolling({
  task,
  delayMs,
  runImmediately = true,
  refreshOnFocus = false,
}: AdaptiveVisiblePollingOptions): () => void {
  let stopped = false;
  let inFlight = false;
  let unchangedPolls = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    clearTimer();
    if (stopped || inFlight || !pageIsVisible()) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs(unchangedPolls));
  };

  const run = async () => {
    clearTimer();
    if (stopped || inFlight || !pageIsVisible()) return;
    inFlight = true;
    try {
      const outcome = await task();
      if (outcome === "changed") unchangedPolls = 0;
      if (outcome === "unchanged") unchangedPolls += 1;
    } catch {
      // Consumers keep their current screen state and recover on the next tick.
    } finally {
      inFlight = false;
      schedule();
    }
  };

  const onVisibilityChange = () => {
    if (!pageIsVisible()) {
      clearTimer();
      return;
    }
    void run();
  };
  const onFocus = () => void run();

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  if (refreshOnFocus && typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
  }

  if (runImmediately) void run();
  else schedule();

  return () => {
    stopped = true;
    clearTimer();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (refreshOnFocus && typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
    }
  };
}
