import { STAT_KEYS, STAT_LABELS } from "@/adventure/data/stats";

export function StatsPanel({
  stats,
  totalStats,
  caps,
  combat,
  statKeys = STAT_KEYS,
  statLabels = STAT_LABELS,
}: {
  /** 베이스 + 분배 스탯 (장비 보너스 제외). */
  stats: Record<string, number>;
  /** 베이스 + 분배 + 장비 합산된 최종 스탯. 미지정 시 stats 와 동일 (장비 보너스 표시 X). */
  totalStats?: Record<string, number>;
  /** 각 스탯의 한계치(cap). 지정 시 "값(한계치)" 표기로 바뀌고 장비 보너스 분리는 숨긴다(v2 내 정보). */
  caps?: Record<string, number | undefined>;
  /** 전투력 — 공격력/방어력. magicAtk(마법 공격력)은 v2 INT 빌드만, 0/미지정이면 숨김. */
  combat?: { atk: number; def: number; magicAtk?: number };
  /** 스탯 키/라벨 — 기본은 라이브 6스탯. v2 는 V2_STAT_KEYS/V2_STAT_LABELS 전달. */
  statKeys?: readonly string[];
  statLabels?: Record<string, string>;
}) {
  const showCaps = caps !== undefined;
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
          능력치{!showCaps && totalStats ? " (기본 · 장비)" : ""}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {statKeys.map((k) => {
            const base = stats[k];
            const finalValue = total[k];
            const equipBonus = finalValue - base;
            // caps 모드(v2 내 정보): 장비 분리 대신 "값(한계치)" 표기. 라이브는 종전 장비 분리 유지.
            const hasBonus =
              !showCaps && totalStats !== undefined && equipBonus !== 0;
            const cap = caps?.[k];
            return (
              <div
                key={k}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {statLabels[k]}
                </div>
                {/* 큰 글자 = 기본(베이스 + 분배). caps 모드면 옆에 (한계치), 아니면 장비 보너스로 갈라진다. */}
                <div className="mt-0.5 text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {base}
                  {cap !== undefined && (
                    <span className="ml-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ({cap})
                    </span>
                  )}
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
