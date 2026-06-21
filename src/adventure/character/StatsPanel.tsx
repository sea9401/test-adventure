import { STAT_KEYS, STAT_LABELS } from "@/adventure/data/stats";
import { V2_BASE_MISS_PCT } from "@/adventure/data/v2/v2CombatConstants";
import { Tooltip } from "@/components/ui/Tooltip";

// 기본 명중률 — 평타는 기본 90% 적중(100 − 기본 빗나감). 명중 스탯은 이 위에 더해진다.
const V2_BASE_HIT_PCT = 100 - V2_BASE_MISS_PCT;

// 상세(전투 세부) 스탯 한 줄 설명 — 어떤 1차 스탯이 올려주는지 위주.
// derivePlayerCombatV2 의 계수 매핑을 사람말로 요약.
const COMBAT_STAT_DESCRIPTIONS: Record<string, string> = {
  공격력: "물리 공격의 기본 위력. 힘이 높을수록 커집니다.",
  방어력: "받는 물리 피해를 줄입니다. 활력이 높을수록 커집니다.",
  "마법 공격력": "마법 공격의 기본 위력. 지능이 높을수록 커집니다.",
  "마법 방어력":
    "받는 마법 피해를 줄입니다. 정신·지능이 높을수록 커집니다.",
  회피: "회피 능력치(표시는 캡 75%). 실제 회피 확률은 PvE 에서 적의 명중과 겨뤄 정해져, 강한(깊은) 사냥터일수록 표시값보다 낮아집니다. 민첩·행운이 높을수록 커집니다.",
  명중: "기본 명중 90%에 명중 스탯을 더한 값. 100%를 넘는 만큼은 적 회피와 빗나감을 상쇄하는 여유입니다. 민첩·힘·정신이 보조합니다.",
  "치명타 확률": "공격이 치명타로 터질 확률. 행운이 높을수록 커집니다.",
  "치명타 배율":
    "치명타가 터졌을 때 피해 배수. 행운·힘이 높을수록 커집니다.",
  속도: "행동 순서와 추가 공격을 좌우합니다. 민첩에서 파생되고 장비 무게로 줄어듭니다.",
  "추가 공격 확률": "한 턴에 추가로 공격할 확률. 속도가 높을수록 커집니다.",
};

type CombatStats = {
  atk: number;
  def: number;
  magicAtk?: number;
  magicDef?: number;
  spd?: number;
  evasionPct?: number;
  accuracyPct?: number;
  critChancePct?: number;
  critMult?: number;
  extraAttackChancePct?: number;
};

type CombatItem = { label: string; value: string | number; accent: string };

// 표시할 상세 스탯 목록을 순서대로. magicAtk 은 0(물리 빌드)이면 숨김.
// v2 전용 필드(magicDef·회피 등)는 v2 caller 만 전달 — 라이브(undefined)는 미표시.
function buildCombatItems(combat: CombatStats): CombatItem[] {
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
        label: "회피",
        value: `${Math.round(combat.evasionPct)}%`,
        accent: "text-teal-600 dark:text-teal-400",
      },
      {
        // 기본 명중 90% 를 포함해 표기 — "명중 N%" 가 적중률로 읽히게. 100% 초과분은
        // 적 회피·빗나감을 상쇄하는 여유(명중 스탯은 derive 에서 이미 35 상한).
        label: "명중",
        value: `${Math.round(V2_BASE_HIT_PCT + (combat.accuracyPct ?? 0))}%`,
        accent: "text-amber-600 dark:text-amber-400",
      },
      {
        label: "치명타 확률",
        value: `${Math.round(combat.critChancePct ?? 0)}%`,
        accent: "text-orange-600 dark:text-orange-400",
      },
      {
        label: "치명타 배율",
        value: `×${(combat.critMult ?? 0).toFixed(2)}`,
        accent: "text-pink-600 dark:text-pink-400",
      },
      {
        label: "속도",
        value: Math.round(combat.spd ?? 0),
        accent: "text-emerald-600 dark:text-emerald-400",
      },
      {
        label: "추가 공격 확률",
        value: `${Math.round(combat.extraAttackChancePct ?? 0)}%`,
        accent: "text-violet-600 dark:text-violet-400",
      },
    );
  }
  return items;
}

// 셀 공통 모양 — 버튼 트리거로도 div 로도 쓰는 클래스.
const COMBAT_CELL =
  "block w-full cursor-help rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700";
const STAT_CELL =
  "block w-full cursor-help rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700";

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
          <div className="mt-2 grid grid-cols-2 gap-2">
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
        <div className="mt-2 grid grid-cols-6 gap-2">
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
                <span className="mt-0.5 block text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                  {base}
                  {cap !== undefined && (
                    <span className="ml-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      ({cap})
                    </span>
                  )}
                </span>
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
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center dark:border-zinc-800 dark:bg-zinc-900/50"
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
