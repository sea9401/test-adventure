import type { ReactNode } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

export type LoadoutStatKey =
  | "power"
  | "maxHp"
  | "maxMp"
  | "atk"
  | "magicAtk"
  | "def"
  | "magicDef"
  | "spd"
  | "accuracy"
  | "evasion"
  | "crit";

export type LoadoutStatSnapshot = Partial<Record<LoadoutStatKey, number>>;
export type LoadoutStatDelta = Partial<Record<LoadoutStatKey, number>>;

export type LoadoutStatSource = {
  character?: {
    maxHp?: number;
    maxMp?: number;
  } | null;
  combat?: {
    power?: number;
    atk?: number;
    magicAtk?: number;
    def?: number;
    magicDef?: number;
    spd?: number;
    accRating?: number;
    accuracyPct?: number;
    evaRating?: number;
    evasionPct?: number;
    critChancePct?: number;
  } | null;
};

type StatDefinition = {
  key: LoadoutStatKey;
  label: string;
  percent?: boolean;
  optional?: boolean;
};

const STAT_DEFINITIONS: readonly StatDefinition[] = [
  { key: "power", label: "전투력" },
  { key: "maxHp", label: "최대 HP" },
  { key: "maxMp", label: "최대 MP", optional: true },
  { key: "atk", label: "공격력" },
  { key: "magicAtk", label: "마법 공격력", optional: true },
  { key: "def", label: "방어력" },
  { key: "magicDef", label: "마법 방어력", optional: true },
  { key: "spd", label: "속도" },
  { key: "accuracy", label: "적중도" },
  { key: "evasion", label: "회피도" },
  { key: "crit", label: "치명타율", percent: true },
];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function copyFinite(
  target: LoadoutStatSnapshot,
  key: LoadoutStatKey,
  value: unknown,
) {
  if (finite(value)) target[key] = value;
}

export function loadoutStatSnapshot(
  source: LoadoutStatSource,
): LoadoutStatSnapshot | null {
  const combat = source.combat;
  if (!combat) return null;

  const snapshot: LoadoutStatSnapshot = {};
  copyFinite(snapshot, "power", combat.power);
  copyFinite(snapshot, "maxHp", source.character?.maxHp);
  copyFinite(snapshot, "maxMp", source.character?.maxMp);
  copyFinite(snapshot, "atk", combat.atk);
  copyFinite(snapshot, "magicAtk", combat.magicAtk);
  copyFinite(snapshot, "def", combat.def);
  copyFinite(snapshot, "magicDef", combat.magicDef);
  copyFinite(snapshot, "spd", combat.spd);
  copyFinite(
    snapshot,
    "accuracy",
    finite(combat.accRating) ? combat.accRating : combat.accuracyPct,
  );
  copyFinite(
    snapshot,
    "evasion",
    finite(combat.evaRating) ? combat.evaRating : combat.evasionPct,
  );
  copyFinite(snapshot, "crit", combat.critChancePct);
  return snapshot;
}

export function diffLoadoutStats(
  previous: LoadoutStatSnapshot,
  current: LoadoutStatSnapshot,
): LoadoutStatDelta {
  const delta: LoadoutStatDelta = {};
  for (const { key } of STAT_DEFINITIONS) {
    const before = previous[key];
    const after = current[key];
    if (!finite(before) || !finite(after)) continue;
    const difference = after - before;
    if (difference !== 0) delta[key] = difference;
  }
  return delta;
}

function formatValue(value: number, percent = false): string {
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
  return percent ? `${formatted}%` : formatted;
}

function formatDelta(value: number, percent = false): string {
  const prefix = value > 0 ? "+" : "";
  const suffix = percent ? "%p" : "";
  return `${prefix}${formatValue(value)}${suffix}`;
}

function visibleDefinitions(
  current: LoadoutStatSnapshot | null,
  delta: LoadoutStatDelta | null,
): StatDefinition[] {
  if (!current) return [];
  return STAT_DEFINITIONS.filter(({ key, optional }) => {
    const value = current[key];
    if (!finite(value)) return false;
    return !optional || value !== 0 || finite(delta?.[key]);
  });
}

function changedDefinitions(delta: LoadoutStatDelta | null): StatDefinition[] {
  if (!delta) return [];
  return STAT_DEFINITIONS.filter(({ key }) => finite(delta[key]));
}

function mobileChangeLabel(delta: LoadoutStatDelta | null): string {
  if (delta === null) return "현재 수치 보기";
  const changed = changedDefinitions(delta);
  if (changed.length === 0) return "최근 변경 · 변동 없음";
  const first = changed[0];
  const value = delta[first.key]!;
  return `최근 변경 · ${first.label} ${formatDelta(value, first.percent)}${
    changed.length > 1 ? ` 외 ${changed.length - 1}` : ""
  }`;
}

function SummaryBody({
  current,
  delta,
}: {
  current: LoadoutStatSnapshot | null;
  delta: LoadoutStatDelta | null;
}) {
  const definitions = visibleDefinitions(current, delta);
  const hasConfirmedChange = delta !== null;
  const changed = changedDefinitions(delta);

  return (
    <div className="space-y-2">
      {hasConfirmedChange && changed.length === 0 && (
        <div
          className={`${SURFACE_INSET} px-2.5 py-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300`}
          aria-live="polite"
        >
          <strong className="font-semibold">주요 능력치 변동 없음</strong>
          <span className="block text-zinc-500 dark:text-zinc-400">
            스킬 고유 효과는 설명대로 적용됩니다.
          </span>
        </div>
      )}
      {definitions.length > 0 ? (
        <dl className={`${SURFACE_INSET} divide-y divide-zinc-200 px-2.5 dark:divide-zinc-700`}>
          {definitions.map(({ key, label, percent }) => {
            const value = current?.[key];
            if (!finite(value)) return null;
            const difference = delta?.[key];
            const changedValue = finite(difference);
            const previous = changedValue ? value - difference : value;
            return (
              <div
                key={key}
                className="flex min-h-9 items-center justify-between gap-2 py-1.5 text-xs"
              >
                <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="text-right tabular-nums text-zinc-800 dark:text-zinc-100">
                  {changedValue ? (
                    <span
                      aria-live="polite"
                      aria-label={`${formatValue(previous, percent)} → ${formatValue(value, percent)} (${formatDelta(difference, percent)})`}
                    >
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {formatValue(previous, percent)} →{" "}
                      </span>
                      <strong>{formatValue(value, percent)}</strong>{" "}
                      <span
                        className={
                          difference > 0
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : "font-semibold text-rose-700 dark:text-rose-400"
                        }
                      >
                        ({formatDelta(difference, percent)})
                      </span>
                    </span>
                  ) : (
                    <strong>{formatValue(value, percent)}</strong>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="px-1 py-2 text-xs text-zinc-500 dark:text-zinc-400">
          능력치를 불러오는 중…
        </p>
      )}
    </div>
  );
}

export function LoadoutStatSummary({
  current,
  delta,
  collapsible = false,
}: {
  current: LoadoutStatSnapshot | null;
  delta: LoadoutStatDelta | null;
  collapsible?: boolean;
}) {
  if (collapsible) {
    return (
      <details className={`${SURFACE_CARD} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          <span>주요 능력치</span>
          <span className="text-[11px] font-medium text-zinc-500 group-open:hidden dark:text-zinc-400">
            {mobileChangeLabel(delta)}
          </span>
          <span className="hidden text-[11px] font-medium text-zinc-500 group-open:inline dark:text-zinc-400">
            접기
          </span>
        </summary>
        <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
          <SummaryBody current={current} delta={delta} />
        </div>
      </details>
    );
  }

  return (
    <section className={`${SURFACE_CARD} p-3`} aria-labelledby="loadout-stat-heading">
      <div className="mb-2">
        <h2 id="loadout-stat-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          주요 능력치
        </h2>
        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          장착 저장 후 실제 적용 수치
        </p>
      </div>
      <SummaryBody current={current} delta={delta} />
    </section>
  );
}

export function LoadoutStatResponsiveLayout({
  current,
  delta,
  children,
}: {
  current: LoadoutStatSnapshot | null;
  delta: LoadoutStatDelta | null;
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,720px)_minmax(240px,280px)]">
      <div className="min-w-0 space-y-3">
        <div className="lg:hidden">
          <LoadoutStatSummary current={current} delta={delta} collapsible />
        </div>
        {children}
      </div>
      <aside className="sticky top-3 hidden lg:block">
        <LoadoutStatSummary current={current} delta={delta} />
      </aside>
    </div>
  );
}
