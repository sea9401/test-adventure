"use client";

// MP 표시 바 — HpBar 의 MP 판. MP 는 시간 재생이 없어 anchor 불필요(고정값 표시).
// 전투 후 충전약으로 채워지므로 사냥 응답마다 갱신된다.
export type MpBarState = {
  mp: number;
  maxMp: number;
};

export function MpBar({ state, compact }: { state: MpBarState; compact?: boolean }) {
  const maxMp = Math.max(0, state.maxMp);
  if (maxMp <= 0) return null; // MP 안 쓰는 빌드(INT 0)는 바 자체 숨김.
  const mp = Math.max(0, Math.min(maxMp, state.mp));
  const pct = Math.max(0, Math.min(100, (mp / maxMp) * 100));

  if (compact) {
    return (
      <div className="space-y-0.5">
        <div className="flex items-baseline justify-between gap-1.5 text-[12px]">
          <span className="text-zinc-600 dark:text-zinc-400">MP</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            {mp}/{maxMp}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-sky-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">마력</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {mp} / {maxMp}
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-sky-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
