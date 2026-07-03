"use client";

// v2 던전 사냥 결과 카드 — 간단 버전.
// 사용자 의도: 승/패 + EXP·골드·드랍만. 몬스터 img/이름·HP·턴 제거.
// 사이즈 축소 — padding sm + 작은 font.

import { Card } from "@/components/ui/Card";
import { ChargeReadout } from "@/adventure/battle/BattleScene";
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
import {
  RARE_MAP_KINDS,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import { itemNameClass } from "@/adventure/v2/V2ItemCard";

export type HuntResult = {
  floor: number;
  enemyName: string;
  won: boolean;
  expGained: number;
  proficiencyGained?: number; // 숙달 포인트 획득(승리·깊이별 +2~3).
  masteryGained?: number; // 직업 숙련도 획득(승리당 +1).
  goldGained: number;
  goldGross?: number;
  hotTime?: {
    title: string;
    expBonus: number;
    goldBonus: number;
    expPct: number;
    goldPct: number;
  } | null;
  goldTaxed?: number;
  // 세금 수취자 표기 — 점령 길드명/솔로 점령자/거점 금고. goldTaxed>0 일 때만 서버가 채움.
  taxOwnerLabel?: string;
  // 코어루프 패배 압류 — 패배 시 "마지막 패배 이후 번 골드"의 절반이 소실된 액수.
  //   서버가 패배 시에만 >0 으로 채운다(승리/flag off = 0/미설정). 점령세금(goldTaxed)과 별개.
  lossTax?: number;
  levelsGained: number;
  spMilestonesGained?: number; // 코어루프 — 이번 사냥에서 새로 넘은 SP 마일스톤(>0 일 때만 표기).
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
  // 희귀 탐사 — 새 탐사 개방(kind id) / 입장 중 남은 판수.
  rareMapDrop?: RareMapKindId | null;
  rareMapRunsLeft?: number | null;
  // PR-1 속성 상성 — 내 속성 vs 몬스터 속성 결과.
  playerElement?: V2Element;
  monsterElement?: V2Element;
  elementMatchup?: ElementMatchup;
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

export function HuntResultCard({
  result,
  hpCharges,
  mpCharges,
  hasMp,
}: {
  result: HuntResult;
  // HP/MP 충전약 잔량 — 전투 결과 하단에 표기(전투 화면에서 이리로 이관). 미전달 시 미표시.
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
}) {
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
  const rareMapDropDef = result.rareMapDrop
    ? RARE_MAP_KINDS[result.rareMapDrop]
    : null;
  const statGainsText = formatStatGains(result.statGains);
  const hpMpGainsText = formatHpMpGains(result.hpGain, result.mpGain);

  return (
    <Card
      padding="sm"
      // 패배 카드는 붉은 링으로 승리 카드와 확연히 구분 — "졌는지 모르고 계속 사냥" 방지.
      className={won ? undefined : "ring-2 ring-rose-400 dark:ring-rose-600"}
    >
      {rareMapDropDef && (
        <div className="ui-reward-flash mb-2 rounded-md border border-sky-400 bg-sky-50 px-2 py-1.5 text-center text-xs font-semibold text-sky-800 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-200">
          {rareMapDropDef.category === "hunt" ? (
            <>
              ✨ 희귀 탐사 「{rareMapDropDef.name}」 개방! — 전투 탭 &gt;
              사냥터에서 입장
            </>
          ) : (
            <>🎟 「{rareMapDropDef.name}」 발견! — 가방 소모품에서 사용</>
          )}
        </div>
      )}
      {droppedUniq && (
        <div className="ui-reward-flash mb-2 rounded-md border border-violet-400 bg-violet-50 px-2 py-1.5 text-center text-xs font-semibold text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-200">
          ✨ 유니크 「
          <span className={itemNameClass(droppedUniq)}>{droppedUniq.name}</span>
          」 획득!
        </div>
      )}
      {dropBannerText && (
        <div className="ui-reward-flash mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {dropBannerText}
        </div>
      )}
      {won ? (
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            전투 결과
          </span>
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            승리
          </span>
        </div>
      ) : (
        // 패배는 작은 글씨 대신 눈에 띄는 배지로 — 승리 카드와 한눈에 구분되게.
        <div className="rounded-md bg-rose-100 py-1.5 text-center dark:bg-rose-900/50">
          <span className="text-base font-bold tracking-wide text-rose-700 dark:text-rose-300">
            💀 패배
          </span>
        </div>
      )}

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
        {(result.masteryGained ?? 0) > 0 && (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-zinc-500 dark:text-zinc-400">직업 숙련도</span>
            <span className="font-medium tabular-nums text-sky-600 dark:text-sky-400">
              +{result.masteryGained}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="text-zinc-500 dark:text-zinc-400">골드</span>
          <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
            +{result.goldGained}
          </span>
        </div>
        {result.hotTime && (result.hotTime.expBonus > 0 || result.hotTime.goldBonus > 0) && (
          <div className="text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-300">
            핫타임 {result.hotTime.title || "이벤트"} · EXP +
            {result.hotTime.expBonus} · 골드 +{result.hotTime.goldBonus}
          </div>
        )}
        {(result.goldTaxed ?? 0) > 0 && (
          <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            세금 −{result.goldTaxed} G → {result.taxOwnerLabel ?? "점령자"}
          </div>
        )}
        {(result.lossTax ?? 0) > 0 && (
          <div className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            골드 −{result.lossTax} G 압류 (패배 페널티)
          </div>
        )}
      </div>

      {result.levelsGained > 0 && (
        <div className="ui-reward-flash mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-center dark:border-amber-700 dark:bg-amber-950">
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

      {(result.spMilestonesGained ?? 0) > 0 && (
        <div className="ui-reward-flash mt-2 rounded-md border border-violet-300 bg-violet-50 px-2 py-1.5 text-center dark:border-violet-700 dark:bg-violet-950">
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            스킬포인트 +{result.spMilestonesGained} 획득!
          </span>
        </div>
      )}

      {/* HP/MP 충전약 잔량 — 전투 화면에서 이리로 이관. */}
      {hpCharges != null && (
        <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
          <ChargeReadout
            emoji="🧪"
            label="HP 충전약"
            value={hpCharges}
            activeText="text-rose-500"
          />
          {hasMp && (
            <ChargeReadout
              emoji="🔷"
              label="MP 충전약"
              value={mpCharges ?? 0}
              activeText="text-blue-500"
            />
          )}
        </div>
      )}
    </Card>
  );
}
