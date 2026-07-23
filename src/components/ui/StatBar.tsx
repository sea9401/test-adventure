export function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="ui-profile-readable-copy ui-stat-bar-copy w-8 shrink-0 text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="ui-game-meter h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`ui-game-meter-fill h-full ${color} transition-all`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="ui-stat-bar-copy w-24 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-zinc-500 sm:w-[7.5rem] dark:text-zinc-400">
        <span className="ui-profile-value-chip">
          {value}/{max}
        </span>
      </span>
    </div>
  );
}
