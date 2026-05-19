import { LODGE_RANK_MAX, type LodgeResponse } from "@/adventure/data/guildLodge";

function renderStars(rank: number): string {
  const clamped = Math.max(0, Math.min(LODGE_RANK_MAX, rank));
  return "★".repeat(clamped) + "☆".repeat(LODGE_RANK_MAX - clamped);
}

function ProgressBar({
  current,
  required,
  label,
}: {
  current: number;
  required: number;
  label: string;
}) {
  // required 가 0 이면 (rank=1 임계처럼) 진행도 의미가 없으므로 가득 찬 상태로.
  const pct =
    required <= 0 ? 100 : Math.min(100, Math.floor((current / required) * 100));
  const met = current >= required;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span
          className={`tabular-nums ${
            met
              ? "font-semibold text-emerald-700 dark:text-emerald-400"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {current.toLocaleString()} / {required.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full transition-[width] ${
            met
              ? "bg-emerald-500 dark:bg-emerald-400"
              : "bg-violet-500 dark:bg-violet-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RankProgress({
  rank,
  nextRank,
  stardustTotal,
  goldTotal,
  isMaster,
  busy,
  onUpgrade,
}: {
  rank: number;
  nextRank: LodgeResponse["nextRank"];
  stardustTotal: number;
  goldTotal: number;
  isMaster: boolean;
  busy: boolean;
  onUpgrade: () => void;
}) {
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          회관 등급
        </h4>
        <span className="font-mono text-base tracking-[0.2em] text-amber-500 dark:text-amber-400">
          {renderStars(rank)}
        </span>
      </header>

      {nextRank ? (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            다음 등급:{" "}
            <span className="font-mono tracking-[0.2em] text-amber-500 dark:text-amber-400">
              {renderStars(nextRank.rank)}
            </span>
          </p>
          <ProgressBar
            label="별빛 조각"
            current={stardustTotal}
            required={nextRank.stardustReq}
          />
          <ProgressBar
            label="골드"
            current={goldTotal}
            required={nextRank.goldReq}
          />
          {isMaster && nextRank.ready ? (
            <button
              type="button"
              onClick={onUpgrade}
              disabled={busy}
              className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↗ {renderStars(nextRank.rank)} 으로 승급
            </button>
          ) : null}
          {!isMaster && nextRank.ready ? (
            <p className="text-[11px] italic text-emerald-700 dark:text-emerald-400">
              임계 도달 — 마스터가 승급을 진행할 수 있습니다.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
          최고 등급에 도달했습니다.
        </p>
      )}
    </section>
  );
}
