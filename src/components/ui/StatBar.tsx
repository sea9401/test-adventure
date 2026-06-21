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
      <span className="w-8 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
        {value}/{max}
      </span>
    </div>
  );
}
