"use client";

// v2 던전 사냥 결과 카드 — 간단 버전.
// 사용자 의도: 승/패 + EXP·골드·드랍만. 몬스터 img/이름·HP·턴 제거.
// 사이즈 축소 — padding sm + 작은 font.

import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
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
  RARE_MAP_KINDS,
  type RareMapInstance,
  type RareMapKindId,
} from "@/adventure/data/v2/rareMaps";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import { itemNameClass } from "@/adventure/v2/V2ItemCard";
import { DiscoveryNotice } from "@/adventure/v2/DiscoveryNotice";
import { GameIcon } from "@/adventure/v2/GameIcon";
import { BattleOutcomeBadge } from "@/adventure/v2/BattleOutcomeBadge";
import { RewardNotice } from "@/adventure/v2/RewardNotice";

export type HuntResult = {
  floor: number;
  enemyName: string;
  won: boolean;
  expGained: number;
  expAfter?: number; // 사냥 후 현재 레벨의 경험치 잔액.
  proficiencyGained?: number; // 숙달 포인트 획득(승리·깊이별 +2~3).
  proficiencyPointsAfter?: number; // 사냥 후 사용 가능한 숙달 포인트 잔액.
  masteryGained?: number; // 직업 숙련도 획득(승리당 +1).
  masteryAfter?: number | null; // 사냥 후 현재 직업 숙련도.
  goldGained: number;
  goldAfter?: number; // 사냥 후 현재 보유 골드.
  goldGross?: number;
  hotTime?: {
    title: string;
    expBonus: number;
    goldBonus: number;
    expPct: number;
    goldPct: number;
  } | null;
  foodExpBuff?: {
    name: string;
    expPct: number;
    expBonus: number;
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
  // 새로 생성된 지도 개체 — 결과 화면에서 해당 지도 바로가기용.
  rareMapDropInstance?: RareMapInstance | null;
  rareMapRunsLeft?: number | null;
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
  return `${parts.join(", ")}을(를) 획득했다!`;
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

export type RewardBalanceItem = {
  label: string;
  current: number | null | undefined;
  gained: number;
  lost?: number;
  currentClassName: string;
  gainedClassName: string;
};

// 전투 결과의 핵심 재화 — 큰 숫자는 전투 후 현재 보유량, 작은 숫자는 이번 획득/손실이다.
export function RewardBalanceGrid({ items }: { items: RewardBalanceItem[] }) {
  return (
    <div
      className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      aria-label="전투 후 보유량과 이번 변동"
    >
      {items.map((item) => {
        const gained = Math.max(0, item.gained);
        const lost = Math.max(0, item.lost ?? 0);
        return (
          <div
            key={item.label}
            className={`${SURFACE_INSET} min-w-0 px-2 py-2 text-center`}
          >
            <div className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {item.label}
            </div>
            <div
              className={`mt-0.5 truncate text-base font-semibold tabular-nums ${item.currentClassName}`}
              title={
                item.current == null
                  ? undefined
                  : item.current.toLocaleString("ko-KR")
              }
            >
              {item.current == null
                ? "—"
                : item.current.toLocaleString("ko-KR")}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1 text-xs font-semibold tabular-nums">
              {(gained > 0 || lost === 0) && (
                <span className={item.gainedClassName}>
                  +{gained.toLocaleString("ko-KR")}
                </span>
              )}
              {lost > 0 && (
                <span className="text-rose-700 dark:text-rose-300">
                  −{lost.toLocaleString("ko-KR")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GoldLossNotice({
  loss,
  goldAfter,
}: {
  loss: number;
  goldAfter?: number | null;
}) {
  const normalizedLoss = Number.isFinite(loss)
    ? Math.max(0, Math.floor(loss))
    : 0;
  const normalizedAfter =
    goldAfter == null || !Number.isFinite(goldAfter)
      ? null
      : Math.max(0, Math.floor(goldAfter));

  return (
    <StatusBanner
      tone="error"
      role="alert"
      className="mt-2 py-3 text-center"
    >
      {normalizedLoss > 0 ? (
        <>
          <div className="text-sm font-bold tabular-nums">
            패배 페널티 · 골드 −{normalizedLoss.toLocaleString("ko-KR")} G
          </div>
          {normalizedAfter != null && (
            <div className="mt-1 tabular-nums">
              보유 골드 {(normalizedAfter + normalizedLoss).toLocaleString("ko-KR")} G
              {" → "}
              {normalizedAfter.toLocaleString("ko-KR")} G
            </div>
          )}
        </>
      ) : (
        <div className="text-sm font-semibold">이번 패배로 잃은 골드는 없습니다.</div>
      )}
    </StatusBanner>
  );
}

export function HuntResultCard({
  result,
  hpCharges,
  mpCharges,
  hasMp,
  onEnterRareMap,
}: {
  result: HuntResult;
  // HP/MP 충전약 잔량 — 전투 결과 하단에 표기(전투 화면에서 이리로 이관). 미전달 시 미표시.
  hpCharges?: number;
  mpCharges?: number;
  hasMp?: boolean;
  onEnterRareMap?: (map: RareMapInstance) => void;
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
  const droppedSet = droppedEquip?.setId ? droppedEquip : null;
  // 드랍 알림 배너 — 매 사냥마다 (드랍 있을 때만). 1회성 storyFlags 폐기 (사용자
  // 요청 2026-05-28): 매번 어떤 아이템 받았는지 명시적 알림이 후크에 더 효과적.
  const dropBannerText = formatDropBanner(
    drops as Array<[string, number]>,
    droppedSet ? null : (droppedEquip?.name ?? null),
  );
  const rareMapDropDef = result.rareMapDrop
    ? RARE_MAP_KINDS[result.rareMapDrop]
    : null;
  const statGainsText = formatStatGains(result.statGains);
  const hpMpGainsText = formatHpMpGains(result.hpGain, result.mpGain);
  const rewardBalances: RewardBalanceItem[] = [
    {
      label: "골드",
      current: result.goldAfter,
      gained: result.goldGained,
      lost: result.lossTax,
      currentClassName: "text-yellow-700 dark:text-yellow-300",
      gainedClassName: "text-yellow-600 dark:text-yellow-400",
    },
    {
      label: "직업 숙련도",
      current: result.masteryAfter,
      gained: result.masteryGained ?? 0,
      currentClassName: "text-sky-700 dark:text-sky-300",
      gainedClassName: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "숙달 포인트",
      current: result.proficiencyPointsAfter,
      gained: result.proficiencyGained ?? 0,
      currentClassName: "text-violet-700 dark:text-violet-300",
      gainedClassName: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "경험치",
      current: result.expAfter,
      gained: result.expGained,
      currentClassName: "text-emerald-700 dark:text-emerald-300",
      gainedClassName: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <Card
      padding="sm"
      // 패배 카드는 붉은 링으로 승리 카드와 확연히 구분 — "졌는지 모르고 계속 사냥" 방지.
      className={won ? undefined : "ring-2 ring-rose-400 dark:ring-rose-600"}
    >
      {rareMapDropDef && (
        <DiscoveryNotice
          kind={rareMapDropDef.category}
          className="mb-2"
          action={
            result.rareMapDropInstance &&
            rareMapDropDef.category !== "utility" &&
            onEnterRareMap ? (
              <button
                type="button"
                onClick={() => onEnterRareMap(result.rareMapDropInstance!)}
                className="ui-game-button shrink-0 rounded-md border border-sky-500 bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700"
              >
                바로가기
              </button>
            ) : undefined
          }
        >
          {rareMapDropDef.category === "hunt"
            ? `희귀 탐사 「${rareMapDropDef.name}」 개방!${result.rareMapDropInstance ? "" : " — 전투 탭 > 사냥터에서 입장"}`
            : rareMapDropDef.category === "location"
              ? `희귀 장소 「${rareMapDropDef.name}」 개방!${result.rareMapDropInstance ? "" : " — 전투 탭 > 사냥터에서 입장"}`
              : `「${rareMapDropDef.name}」 획득! — 가방 소모품에서 사용`}
        </DiscoveryNotice>
      )}
      {droppedUniq && (
        <div className="ui-reward-flash mb-2 flex items-center justify-center gap-1.5 rounded-md border border-violet-400 bg-violet-50 px-2 py-1.5 text-center text-xs font-semibold text-violet-800 dark:border-violet-600 dark:bg-violet-950 dark:text-violet-200">
          <GameIcon name="Sparkle" size={15} className="shrink-0" />
          <span>
            {droppedUniq.setId ? "유니크 세트 「" : "유니크 「"}
            <span className={itemNameClass(droppedUniq)}>{droppedUniq.name}</span>
            」 획득!
          </span>
        </div>
      )}
      {droppedSet && (
        <div className="ui-reward-flash mb-2 flex items-center justify-center gap-1.5 rounded-md border border-emerald-400 bg-emerald-50 px-2 py-1.5 text-center text-xs font-semibold text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-200">
          <GameIcon name="Sparkle" size={15} className="shrink-0" />
          <span>세트 「{droppedSet.name}」 획득!</span>
        </div>
      )}
      {dropBannerText && (
        <RewardNotice className="mb-2">
          {dropBannerText}
        </RewardNotice>
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
        <StatusBanner tone="error" className="py-1.5 text-center">
          <BattleOutcomeBadge outcome="lose" />
        </StatusBanner>
      )}

      {!won && (
        <GoldLossNotice
          loss={result.lossTax ?? 0}
          goldAfter={result.goldAfter}
        />
      )}

      <RewardBalanceGrid items={rewardBalances} />

      <div className="mt-2 space-y-1 text-center text-sm">
        {result.hotTime && (result.hotTime.expBonus > 0 || result.hotTime.goldBonus > 0) && (
          <div className="text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-300">
            핫타임 {result.hotTime.title || "이벤트"} · EXP +
            {result.hotTime.expBonus} · 골드 +{result.hotTime.goldBonus}
          </div>
        )}
        {result.foodExpBuff && result.foodExpBuff.expBonus > 0 && (
          <div className="text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-300">
            {result.foodExpBuff.name} · 사냥 경험치 +{result.foodExpBuff.expPct}%
            (EXP +{result.foodExpBuff.expBonus})
          </div>
        )}
        {(result.goldTaxed ?? 0) > 0 && (
          <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            세금 −{result.goldTaxed} G → {result.taxOwnerLabel ?? "점령자"}
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
            iconName="Flask"
            label="HP 충전약"
            value={hpCharges}
            activeText="text-rose-500"
          />
          {hasMp && (
            <ChargeReadout
              iconName="Diamond"
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
