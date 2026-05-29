import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/adventure/data/stats";

export function StatsPanel({
  stats,
  totalStats,
  combat,
}: {
  /** 베이스 + 분배 스탯 (장비 보너스 제외). */
  stats: Record<StatKey, number>;
  /** 베이스 + 분배 + 장비 합산된 최종 스탯. 미지정 시 stats 와 동일 (장비 보너스 표시 X). */
  totalStats?: Record<StatKey, number>;
  /** 전투력 — 공격력/방어력. magicAtk(마법 공격력)은 v2 INT 빌드만, 0/미지정이면 숨김. */
  combat?: { atk: number; def: number; magicAtk?: number };
}) {
  const total = totalStats ?? stats;
  return (
    <div className="space-y-4">
      {combat && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            전투력
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <CombatStat label="공격력" value={combat.atk} accent="text-rose-600 dark:text-rose-400" />
            <CombatStat label="방어력" value={combat.def} accent="text-sky-600 dark:text-sky-400" />
            {/* 마법 공격력 — INT 환산. 마법 빌드(INT>0)만 노출, 물리 빌드는 0이라 숨김. */}
            {combat.magicAtk ? (
              <CombatStat
                label="마법 공격력"
                value={combat.magicAtk}
                accent="text-indigo-600 dark:text-indigo-400"
              />
            ) : null}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          능력치{totalStats ? " (기본 · 장비)" : ""}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {STAT_KEYS.map((k) => {
            const base = stats[k];
            const finalValue = total[k];
            const equipBonus = finalValue - base;
            const hasBonus = totalStats !== undefined && equipBonus !== 0;
            return (
              <div
                key={k}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {STAT_LABELS[k]}
                </div>
                {/* 큰 글자 = 기본(베이스 + 분배). 장비 보너스가 있어야만 그 아래로 갈라진다. */}
                <div className="mt-0.5 text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {base}
                </div>
                {hasBonus && (
                  <>
                    <div
                      className={`text-[10px] tabular-nums ${
                        equipBonus > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-500 dark:text-rose-400"
                      }`}
                    >
                      장비 {equipBonus > 0 ? "+" : ""}
                      {equipBonus}
                    </div>
                    <div className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      = {finalValue}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CombatStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}
