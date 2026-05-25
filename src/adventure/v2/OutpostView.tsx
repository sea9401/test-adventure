"use client";

import type { Outpost, OutpostType, OutpostTier } from "@/adventure/data/v2/types";

// 라이브 TownScreen 의 메뉴 카드 UI 패턴을 v2 거점에 적용.
// 거점 hub — 진입 시 그 거점에서 할 수 있는 활동 리스트 보여줌.
// 현재 활동 = "던전 입장" 만. 미래 확장:
//   - 점령 시도 (점령 가능 거점)
//   - 상점 (마을·도시 type)
//   - 병사 모집 (요새 type, 본인 길드 점령 시)
//   - 자원 산출 확인 (광산 type)

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};

const TIER_LABEL: Record<OutpostTier, string> = {
  1: "마을",
  2: "거점",
  3: "도시",
  4: "왕국",
};

export type OutpostAction =
  | { kind: "back" }
  | { kind: "enter-dungeon" };

export function OutpostView({
  outpost,
  onAction,
}: {
  outpost: Outpost;
  onAction: (action: OutpostAction) => void;
}) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => onAction({ kind: "back" })}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 대륙 지도로
        </button>
        <h1 className="text-lg font-bold">{outpost.name}</h1>
        <div className="flex flex-wrap gap-1 text-xs">
          <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
            {TIER_LABEL[outpost.tier]}
          </span>
          <span className="rounded bg-zinc-200 px-2 py-0.5 dark:bg-zinc-800">
            {TYPE_LABEL[outpost.type]}
          </span>
          {outpost.neutral && (
            <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
              절대 중립
            </span>
          )}
        </div>
        {outpost.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {outpost.description}
          </p>
        )}
      </header>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          여기서 할 수 있는 것
        </div>

        <ActionCard
          title="던전 입장"
          subtitle="5층 던전에서 사냥. 스태미너 소모."
          onClick={() => onAction({ kind: "enter-dungeon" })}
        />

        {/* 미래 카드들 (placeholder) */}
        <ActionCard
          title="점령 시도"
          subtitle="이 거점을 길드 영지로 점령."
          disabled
          disabledReason={
            outpost.neutral ? "절대 중립 거점 (점령 불가)" : "곧 공개"
          }
        />
        {outpost.type === "village" && (
          <ActionCard
            title="상점"
            subtitle="아이템 거래."
            disabled
            disabledReason="곧 공개"
          />
        )}
        {outpost.type === "fort" && (
          <ActionCard
            title="병사 모집"
            subtitle="자길드 점령 시 가능."
            disabled
            disabledReason="곧 공개"
          />
        )}
        {outpost.type === "mine" && (
          <ActionCard
            title="자원 산출"
            subtitle="광산이 시간당 산출하는 자원 확인."
            disabled
            disabledReason="곧 공개"
          />
        )}
      </section>
    </main>
  );
}

function ActionCard({
  title,
  subtitle,
  onClick,
  disabled,
  disabledReason,
}: {
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
    >
      <div className="font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-zinc-500">
        {disabled && disabledReason ? disabledReason : subtitle}
      </div>
    </button>
  );
}
