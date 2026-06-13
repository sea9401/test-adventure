"use client";

// v2 던전 사냥 결과 카드 — 간단 버전.
// 사용자 의도: 승/패 + EXP·골드·드랍만. 몬스터 img/이름·HP·턴 제거.
// 사이즈 축소 — padding sm + 작은 font.

import { Card } from "@/components/ui/Card";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_ELEMENT_LABEL,
  type ElementMatchup,
  type V2Element,
} from "@/adventure/data/v2/elements";
import { WEATHER_TIER_LABEL } from "@/adventure/data/v2/weather";
import {
  RARE_MAP_KINDS,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";

export type HuntResult = {
  floor: number;
  enemyName: string;
  won: boolean;
  expGained: number;
  proficiencyGained?: number; // 직업군 숙달 포인트 획득 (+2/킬).
  goldGained: number;
  goldGross?: number;
  goldTaxed?: number;
  // 세금 수취자 표기 — 점령 길드명/솔로 점령자/거점 금고. goldTaxed>0 일 때만 서버가 채움.
  taxOwnerLabel?: string;
  levelsGained: number;
  statGains?: Partial<Record<V2StatKey, number>>; // 레벨업 랜덤 성장으로 오른 1차 스탯.
  hpGain?: number; // 레벨업으로 오른 maxHp (레벨 고정분 + VIT).
  mpGain?: number; // 레벨업으로 오른 maxMp (레벨 고정분 + INT).
  turns: number;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  drops?: Partial<Record<V2MaterialId, number>>;
  droppedEquipment?: V2EquipmentId | null;
  droppedUnique?: V2EquipmentId | null;
  ejected?: { outpostId: string; byGuildId: number; at: number } | null;
  // 레어맵 — 새 지도 발견(kind id) / 입장 중 남은 판수.
  rareMapDrop?: RareMapKindId | null;
  rareMapRunsLeft?: number | null;
  // PR-1 속성 상성 — 내 속성 vs 몬스터 속성 결과.
  playerElement?: V2Element;
  monsterElement?: V2Element;
  elementMatchup?: ElementMatchup;
  // 날씨 — 내 공격 속성이 받은 단계(거점 밖이면 null·중립이면 tier null).
  weather?: {
    id: string;
    name: string;
    emoji: string;
    tier: "major" | "minor" | "weak" | "poor" | null;
  } | null;
  // 도전(미정복) 구역 클리어 시 갱신된 최고 도달 깊이.
  maxDepth?: number;
};

// 드랍 배너용 — 재료(×N)와 장비 이름들을 자연스러운 한국어 문장으로 합친다.
// "돌멩이 ×2를 획득했다!" / "돌멩이 ×2, 철광석 ×1, 철검을 획득했다!"
function formatDropBanner(
  drops: Array<[string, number]>,
  equipName: string | null,
): string | null {
  const parts: string[] = [];
  for (const [id, amount] of drops) {
    const mat = V2_MATERIALS[id as V2MaterialId];
    parts.push(`${mat?.name ?? id} ×${amount}`);
  }
  if (equipName) parts.push(equipName);
  if (parts.length === 0) return null;
  return `⭐ ${parts.join(", ")}을(를) 획득했다!`;
}

// 레벨업 스탯 성장 — "힘 +3 · 행운 +2" 식으로 1차 스탯 순서대로 합친다.
export function formatStatGains(
  statGains: Partial<Record<V2StatKey, number>> | undefined,
): string | null {
  if (!statGains) return null;
  const parts = V2_STAT_KEYS.filter((k) => (statGains[k] ?? 0) > 0).map(
    (k) => `${V2_STAT_LABELS[k]} +${statGains[k]}`,
  );
  return parts.length ? parts.join(" · ") : null;
}

// 레벨업 HP/MP 성장 — "HP +17 · MP +6". 0 이하면 생략(레벨업이면 둘 다 양수).
export function formatHpMpGains(
  hpGain: number | undefined,
  mpGain: number | undefined,
): string | null {
  const parts: string[] = [];
  if ((hpGain ?? 0) > 0) parts.push(`HP +${hpGain}`);
  if ((mpGain ?? 0) > 0) parts.push(`MP +${mpGain}`);
  return parts.length ? parts.join(" · ") : null;
}

export function HuntResultCard({ result }: { result: HuntResult }) {
  const won = result.won;
  const drops = result.drops
    ? Object.entries(result.drops).filter(([, n]) => (n ?? 0) > 0)
    : [];
  const droppedEquip = result.droppedEquipment
    ? V2_EQUIPMENT[result.droppedEquipment]
    : null;
  const droppedUniq = result.droppedUnique
    ? V2_EQUIPMENT[result.droppedUnique]
    : null;
  // 드랍 알림 배너 — 매 사냥마다 (드랍 있을 때만). 1회성 storyFlags 폐기 (사용자
  // 요청 2026-05-28): 매번 어떤 아이템 받았는지 명시적 알림이 후크에 더 효과적.
  const dropBannerText = formatDropBanner(
    drops as Array<[string, number]>,
    droppedEquip?.name ?? null,
  );
  const statGainsText = formatStatGains(result.statGains);
  const hpMpGainsText = formatHpMpGains(result.hpGain, result.mpGain);

  return (
    <Card padding="sm">
      {result.rareMapDrop && (
        <div className="mb-2 rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-center text-xs font-semibold text-sky-800 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200">
          🗺 「{RARE_MAP_KINDS[result.rareMapDrop].name}」 발견! — 인벤토리
          소모품에서 확인
        </div>
      )}
      {droppedUniq && (
        <div className="mb-2 rounded-md border border-violet-400 bg-violet-50 px-2 py-1.5 text-center text-xs font-semibold text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-200">
          ✨ 유니크 「{droppedUniq.name}」 획득!
        </div>
      )}
      {dropBannerText && (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {dropBannerText}
        </div>
      )}
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          전투 결과
        </span>
        <span
          className={`text-sm font-semibold ${
            won
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {won ? "승리" : "패배"}
        </span>
      </div>

      {result.elementMatchup &&
        result.elementMatchup !== "neutral" &&
        result.monsterElement &&
        result.monsterElement !== "neutral" && (
          <div className="mt-1 text-center text-[11px]">
            <span
              className={
                result.elementMatchup === "advantage"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }
            >
              {V2_ELEMENT_LABEL[result.playerElement ?? "neutral"]} →{" "}
              {V2_ELEMENT_LABEL[result.monsterElement]} · 속성{" "}
              {result.elementMatchup === "advantage" ? "유리 (+)" : "불리 (−)"}
            </span>
          </div>
        )}

      {result.weather && result.weather.tier && (
        <div className="mt-1 text-center text-[11px]">
          <span
            className={
              result.weather.tier === "major" || result.weather.tier === "minor"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }
          >
            {result.weather.emoji} {result.weather.name} ·{" "}
            {V2_ELEMENT_LABEL[result.playerElement ?? "neutral"]}{" "}
            {WEATHER_TIER_LABEL[result.weather.tier]}
          </span>
        </div>
      )}

      <div className="mt-2 space-y-1 text-center text-sm">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">EXP</span>
          <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            +{result.expGained}
          </span>
        </div>
        {(result.proficiencyGained ?? 0) > 0 && (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">숙달 포인트</span>
            <span className="font-medium tabular-nums text-violet-600 dark:text-violet-400">
              +{result.proficiencyGained}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{result.goldGained}
          </span>
        </div>
        {(result.goldTaxed ?? 0) > 0 && (
          <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            세금 −{result.goldTaxed} G → {result.taxOwnerLabel ?? "점령자"}
          </div>
        )}
      </div>

      {result.levelsGained > 0 && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center dark:border-amber-700 dark:bg-amber-950">
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            레벨 업! +{result.levelsGained}
          </span>
          {statGainsText && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-800 dark:text-amber-200">
              {statGainsText}
            </div>
          )}
          {hpMpGainsText && (
            <div className="mt-0.5 text-xs font-medium tabular-nums text-amber-800 dark:text-amber-200">
              {hpMpGainsText}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
