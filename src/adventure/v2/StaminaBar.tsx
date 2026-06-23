"use client";

import { useEffect, useState } from "react";
import { MAX_STAMINA, applyRegen, type StaminaState } from "./stamina";
import { STAMINA_POTION_RESTORE } from "./staminaPotions";

// 스태미너 표시 바.
// state 자체는 DB save 시점 (사냥/회복 시) 에만 변경. 화면 표시값은 1초마다
// applyRegen 으로 계산해 회복 진행을 라이브로 보임 (DB write 없이).
export function StaminaBar({
  state,
  max = MAX_STAMINA,
  potions = 0,
  onUsePotion,
}: {
  state: StaminaState;
  // per-user 최대치(한계의 비약 보너스 반영) — 미전달이면 기본 캡.
  max?: number;
  // 보유 스태미나 포션 수 + 사용 핸들러(사용 개수 지정). 0이거나 미전달이면 + 버튼 숨김.
  //   인벤토리 사용과 별개로, 바 끝 + 버튼 → 모달에서 개수 선택 사용.
  potions?: number;
  onUsePotion?: (count: number) => Promise<void> | void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const display = applyRegen(state, now, max);
  const pct = Math.max(0, Math.min(100, (display.current / max) * 100));

  const showPotionButton = potions > 0 && !!onUsePotion;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">스태미너</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {display.current} / {max}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-amber-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {showPotionButton && (
          // 바 끝 + 버튼 → 포션 사용 모달(개수 선택). 인벤토리 사용과 병행.
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="스태미나 포션 사용"
            aria-label="스태미나 포션 사용"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-amber-500 bg-amber-100 text-sm font-bold leading-none text-amber-800 transition hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/60"
          >
            ＋
          </button>
        )}
      </div>
      {modalOpen && onUsePotion && (
        <StaminaPotionModal
          potions={potions}
          current={display.current}
          max={max}
          onUse={onUsePotion}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// 스태미나 포션 사용 모달 — 보유 수·포션당 회복·현재 스태미나 + 개수 스테퍼.
//   사용 상한 = min(보유, 가득 채우는 데 필요한 개수) → 초과 낭비 방지. 가득이면 사용 불가.
function StaminaPotionModal({
  potions,
  current,
  max,
  onUse,
  onClose,
}: {
  potions: number;
  current: number;
  max: number;
  onUse: (count: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const restore = STAMINA_POTION_RESTORE;
  const needed = Math.max(0, Math.ceil((max - current) / restore));
  const usableMax = Math.min(potions, needed);
  const isFull = usableMax <= 0;
  const [qty, setQty] = useState(usableMax);
  const [busy, setBusy] = useState(false);

  // 표시·사용에 쓰는 유효 개수 — 재생으로 usableMax 가 줄어도 항상 1..usableMax 로 클램프.
  const effQty = Math.max(1, Math.min(qty, usableMax));
  const projected = Math.min(max, current + restore * effQty);

  const handleUse = async () => {
    if (isFull || busy) return;
    setBusy(true);
    try {
      await onUse(effQty);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const stepBtn =
    "flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-lg font-bold leading-none text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          스태미나 포션 사용
        </h2>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">보유</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {potions.toLocaleString()}개
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">포션당 회복</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              +{restore.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">현재</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {current.toLocaleString()} / {max.toLocaleString()}
            </span>
          </div>
        </div>

        {isFull ? (
          <p className="mt-4 rounded-md bg-zinc-100 px-3 py-2 text-center text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            스태미나가 가득 찼어요.
          </p>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setQty(effQty - 1)}
                disabled={busy || effQty <= 1}
                aria-label="개수 줄이기"
                className={stepBtn}
              >
                −
              </button>
              <span className="w-12 text-center text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {effQty}
              </span>
              <button
                type="button"
                onClick={() => setQty(effQty + 1)}
                disabled={busy || effQty >= usableMax}
                aria-label="개수 늘리기"
                className={stepBtn}
              >
                ＋
              </button>
              {usableMax > 1 && (
                <button
                  type="button"
                  onClick={() => setQty(usableMax)}
                  disabled={busy || effQty >= usableMax}
                  className="ml-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  최대
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
              사용 후{" "}
              <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">
                {projected.toLocaleString()} / {max.toLocaleString()}
              </span>
            </p>
          </>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleUse}
            disabled={isFull || busy}
            className="flex-1 rounded-md border border-amber-600 bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "사용 중…" : `${effQty}개 사용`}
          </button>
        </div>
      </div>
    </div>
  );
}
