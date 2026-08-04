import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
  STAT_KEYS,
  STAT_LABELS,
} from "@/adventure/data/stats";
import { SKILL_CRIT_MULT } from "@/adventure/data/v2/v2CombatConstants";
import { Tooltip } from "@/components/ui/Tooltip";
import { SURFACE_INSET } from "@/components/ui/surfaces";

// 상세(전투 세부) 스탯 한 줄 설명 — 어떤 1차 스탯이 올려주는지 위주.
// derivePlayerCombatV2 의 계수 매핑을 사람말로 요약.
const COMBAT_STAT_DESCRIPTIONS: Record<string, string> = {
  공격력: "일반 공격과 물리 스킬의 기본값입니다. 힘이 높을수록 커집니다.",
  방어력: "받는 물리 피해를 줄입니다. 활력이 높을수록 커집니다.",
  "마법 공격력": "마력탄 같은 마법 스킬의 기본값입니다. 지능이 높을수록 커집니다.",
  "마법 방어력":
    "마법형 몬스터의 공격과 마법 스킬 피해를 줄입니다. 정신이 주축이고 지능·반지·목걸이·마법 방어 옵션이 보조합니다.",
  "명중 능력":
    "확률이 아닌 원본 능력 수치입니다. 상대의 회피 능력과 함께 계산해 실제 적중률이 정해집니다. 민첩·힘·지능·정신이 보조합니다.",
  "회피 능력":
    "확률이 아닌 원본 능력 수치입니다. 상대의 명중 능력과 함께 계산해 실제 회피율이 정해집니다. 민첩·행운이 높을수록 커집니다.",
  "현재 사냥터 회피율":
    "현재 사냥터(최대 깊이) 적의 명중 능력을 반영한 실제 회피 확률입니다. 더 깊은 곳에서는 적의 명중 능력이 높아져 달라질 수 있습니다.",
  "치명타 확률":
    "평타와 직접 피해를 주는 액티브 스킬이 함께 사용하는 치명타 확률. 전투에서는 최대 75%까지 적용되고, 초과분은 기본적으로 평타 치명타 피해로 전환됩니다.",
  "평타 치명타 배율":
    "평타 치명타가 터졌을 때의 피해 배수. 표시값에는 치명타 확률 75% 초과분이 전환된 보너스가 포함됩니다.",
  "스킬 치명타 확률":
    "직접 피해를 주는 액티브 스킬에 적용되는 치명타 확률. 캐릭터 치명타 확률을 공유하며 최대 75%까지 적용됩니다.",
  "스킬 치명타 배율":
    "액티브 스킬 치명타의 피해 배수. 평타 치명타 배율과 별개이며, 관련 패시브가 있으면 치명타 확률 75% 초과분도 포함됩니다.",
  속도: "행동 빈도를 좌우합니다. 민첩에서 파생되고 장비 무게로 줄어듭니다.",
};

type CombatStats = {
  atk: number;
  def: number;
  magicAtk?: number;
  magicDef?: number;
  spd?: number;
  evasionPct?: number;
  accuracyPct?: number;
  // 회피 대결형 Slice 2 — 캡 없는 명중레이팅. 표시는 이 raw 를 우선(없으면 accuracyPct 폴백).
  accRating?: number;
  // 회피 대결형 — 캡 없는 회피레이팅. 확률(evasionPct)과 구분해 표시한다.
  evaRating?: number;
  critChancePct?: number;
  critMult?: number;
  skillCritOverflow?: boolean;
};

type CombatItem = { label: string; value: string | number; accent: string };

function critOverflowMult(critChancePct: number | undefined): number {
  return Math.min(
    CRIT_OVERFLOW_DMG_CAP,
    Math.max(0, (critChancePct ?? 0) - CRIT_PCT_CAP) *
      CRIT_OVERFLOW_DMG_PER_PCT,
  );
}

export function activeSkillCritStats(combat: Pick<
  CombatStats,
  "critChancePct" | "skillCritOverflow"
>) {
  return {
    chancePct: Math.min(CRIT_PCT_CAP, Math.max(0, combat.critChancePct ?? 0)),
    multiplier:
      SKILL_CRIT_MULT +
      (combat.skillCritOverflow
        ? critOverflowMult(combat.critChancePct)
        : 0),
  };
}

// 표시할 상세 스탯 목록을 순서대로. magicAtk 은 0(물리 빌드)이면 숨김.
// v2 전용 필드(magicDef·회피 등)는 v2 caller 만 전달 — 라이브(undefined)는 미표시.
function buildCombatItems(combat: CombatStats): CombatItem[] {
  const activeSkillCrit = activeSkillCritStats(combat);
  const items: CombatItem[] = [
    { label: "공격력", value: combat.atk, accent: "text-rose-600 dark:text-rose-400" },
    { label: "방어력", value: combat.def, accent: "text-sky-600 dark:text-sky-400" },
  ];
  if (combat.magicAtk) {
    items.push({
      label: "마법 공격력",
      value: combat.magicAtk,
      accent: "text-indigo-600 dark:text-indigo-400",
    });
  }
  if (combat.magicDef !== undefined) {
    items.push({
      label: "마법 방어력",
      value: combat.magicDef,
      accent: "text-cyan-600 dark:text-cyan-400",
    });
  }
  if (combat.evasionPct !== undefined) {
    items.push(
      {
        label: "명중 능력",
        value: Math.round(combat.accRating ?? combat.accuracyPct ?? 0),
        accent: "text-amber-600 dark:text-amber-400",
      },
      {
        label: "회피 능력",
        value: Math.round(combat.evaRating ?? combat.evasionPct),
        accent: "text-cyan-600 dark:text-cyan-400",
      },
      {
        label: "현재 사냥터 회피율",
        value: `${Math.round(combat.evasionPct)}%`,
        accent: "text-teal-600 dark:text-teal-400",
      },
      {
        label: "치명타 확률",
        value: `${Math.round(combat.critChancePct ?? 0)}%`,
        accent: "text-orange-600 dark:text-orange-400",
      },
      {
        label: "평타 치명타 배율",
        value: `×${(
          (combat.critMult ?? 0) + critOverflowMult(combat.critChancePct)
        ).toFixed(2)}`,
        accent: "text-pink-600 dark:text-pink-400",
      },
      {
        label: "스킬 치명타 확률",
        value: `${Math.round(activeSkillCrit.chancePct)}%`,
        accent: "text-orange-600 dark:text-orange-400",
      },
      {
        label: "스킬 치명타 배율",
        value: `×${activeSkillCrit.multiplier.toFixed(2)}`,
        accent: "text-pink-600 dark:text-pink-400",
      },
      {
        label: "속도",
        value: Math.round(combat.spd ?? 0),
        accent: "text-emerald-600 dark:text-emerald-400",
      },
    );
  }
  return items;
}

// 셀 공통 모양 — 버튼 트리거로도 div 로도 쓰는 클래스.
const COMBAT_CELL =
  `${SURFACE_INSET} block w-full cursor-help px-3 py-2 text-left transition-colors hover:border-zinc-300 dark:hover:border-zinc-600`;
const STAT_CELL_BASE =
  `${SURFACE_INSET} block min-h-[4.5rem] w-full px-2 py-2 text-center`;
const STAT_CELL =
  `${STAT_CELL_BASE} cursor-help transition-colors hover:border-zinc-300 dark:hover:border-zinc-700`;

export function StatsPanel({
  stats,
  totalStats,
  caps,
  combat,
  statKeys = STAT_KEYS,
  statLabels = STAT_LABELS,
  statDescriptions,
}: {
  /** 베이스 + 분배 스탯 (장비 보너스 제외). */
  stats: Record<string, number>;
  /** 베이스 + 분배 + 장비 합산된 최종 스탯. 미지정 시 stats 와 동일 (장비 보너스 표시 X). */
  totalStats?: Record<string, number>;
  /** 각 스탯의 한계치(cap). 지정 시 "값(한계치)" 표기로 바뀌고 장비 보너스 분리는 숨긴다(v2 내 정보). */
  caps?: Record<string, number | undefined>;
  /** 상세(전투 세부) — 공격력/방어력 + (v2) 마법공·마방·회피·명중·치명타·속도. magicAtk 은 0이면 숨김.
   *  v2 전용 필드(magicDef·회피 등)는 v2 caller 만 전달 — 라이브 caller(undefined)는 미표시. */
  combat?: CombatStats;
  /** 스탯 키/라벨 — 기본은 라이브 6스탯. v2 는 V2_STAT_KEYS/V2_STAT_LABELS 전달. */
  statKeys?: readonly string[];
  statLabels?: Record<string, string>;
  /** 능력치 스탯별 설명 — 지정 시 각 셀에 호버/탭 툴팁. 미지정 caller 는 툴팁 없이 표시. */
  statDescriptions?: Record<string, string>;
}) {
  const showCaps = caps !== undefined;
  const total = totalStats ?? stats;
  const combatItems = combat ? buildCombatItems(combat) : [];
  return (
    <div className="space-y-4">
      {combat && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            상세
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {combatItems.map((it, i) => (
              <Tooltip
                key={it.label}
                content={COMBAT_STAT_DESCRIPTIONS[it.label]}
                // 2열 그리드 — 왼쪽 열은 좌측, 오른쪽 열은 우측 정렬해 가로 잘림 방지.
                align={i % 2 === 0 ? "start" : "end"}
                triggerClassName={COMBAT_CELL}
              >
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {it.label}
                </span>
                <span
                  className={`mt-0.5 block text-lg font-semibold tabular-nums ${it.accent}`}
                >
                  {it.value}
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          능력치{!showCaps && totalStats ? " (기본 · 장비)" : ""}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          {statKeys.map((k, idx) => {
            const base = stats[k];
            const finalValue = total[k];
            const equipBonus = finalValue - base;
            // caps 모드(v2 내 정보): 장비 분리 대신 "값(한계치)" 표기. 라이브는 종전 장비 분리 유지.
            const hasBonus =
              !showCaps && totalStats !== undefined && equipBonus !== 0;
            const cap = caps?.[k];
            const desc = statDescriptions?.[k];
            const inner = (
              <>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {statLabels[k]}
                </span>
                {/* 큰 글자 = 기본(베이스 + 분배). caps 모드면 옆에 (한계치), 아니면 장비 보너스로 갈라진다. */}
                <span className="mt-0.5 block break-all text-lg font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-100">
                  {base.toLocaleString()}
                </span>
                {cap !== undefined && (
                  <span className="mt-1 block break-all text-[11px] leading-none tabular-nums text-zinc-500 dark:text-zinc-400">
                    ({cap.toLocaleString()})
                  </span>
                )}
                {hasBonus && (
                  <>
                    <span
                      className={`block text-[10px] tabular-nums ${
                        equipBonus > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-500 dark:text-rose-400"
                      }`}
                    >
                      장비 {equipBonus > 0 ? "+" : ""}
                      {equipBonus}
                    </span>
                    <span className="block text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      = {finalValue}
                    </span>
                  </>
                )}
              </>
            );
            // 설명 없는 caller(라이브 등) 는 종전처럼 정적 셀.
            if (!desc) {
              return (
                <div
                  key={k}
                  className={STAT_CELL_BASE}
                >
                  {inner}
                </div>
              );
            }
            // 6열 그리드 — 양 끝 두 칸은 좌/우, 가운데는 중앙 정렬.
            const align = idx % 6 <= 1 ? "start" : idx % 6 >= 4 ? "end" : "center";
            return (
              <Tooltip
                key={k}
                content={desc}
                align={align}
                triggerClassName={STAT_CELL}
              >
                {inner}
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}
