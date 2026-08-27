"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchGameState } from "./fetchGameState";
import {
  V2CharacterCard,
  type V2CharacterCardData,
} from "./V2CharacterCard";
import { V2AnnouncementsPanel } from "./V2AnnouncementsPanel";
import { GuideQuestBanner } from "./GuideQuestBanner";
import { AdventureRankingPreview } from "./AdventureRankingPreview";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { activeLoadoutPresetName } from "@/adventure/data/v2/v2LoadoutPresets";
import type { MuseunCosmeticAppearance } from "@/adventure/data/v2/museunCosmetics";
import type { ActiveCookingBuff } from "@/adventure/v2/cooking/food";
import type { GuildDiningEffectSummary } from "@/adventure/data/v2/guildDining";
import type {
  V2EquipInstance,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type {
  ProfileMasteryTrophyDisplay,
  ProfileShowcaseSelection,
  ProfileShowcaseSlots,
} from "@/adventure/profile/profileShowcase";
import { useAdventureDashboard } from "./AdventureDashboardProvider";
import {
  DEFAULT_ADVENTURE_HOME_PREFERENCES,
  type AdventureHomePreferences,
  type AdventureHomeWidgetId,
} from "./adventureDashboard";
import { AdventureHomeWidgetGrid } from "./AdventureHomeWidgetGrid";
import { AdventureActivityChecklist } from "./AdventureActivityChecklist";
import { CompactCharacterSummary } from "./CompactCharacterSummary";
import { RecentBulletinPreview } from "./RecentBulletinPreview";
import { StaminaBar } from "./StaminaBar";
import { useGameState } from "./GameStateProvider";
import { Inset } from "@/components/ui/Inset";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";

// 모험 탭 — 캐릭터 상태 + 안내/공지.

type StateResponse = {
  ok?: boolean;
  character?: V2CharacterCardData;
  guild?: { id: number; name: string } | null;
  adventureSupport?: {
    active: boolean;
    activeUntil: number | null;
    regenBonusPct: number;
  };
  cosmetics?: MuseunCosmeticAppearance;
  activeFoodBuff?: ActiveCookingBuff | null;
  activeGuildDiningEffect?: GuildDiningEffectSummary | null;
  profileShowcase?: ProfileShowcaseSelection | null;
  profileShowcaseSlots?: ProfileShowcaseSlots;
  profileMasteryTrophies?: ProfileMasteryTrophyDisplay[];
  profileBadgeStandOwned?: boolean;
  profileBadgeStandVisible?: boolean;
  hotTime?: {
    title: string;
    endsAt: string;
    serverNow: number;
    bonuses: {
      goldPct: number;
      expPct: number;
      masteryPct: number;
      fishingCoinPct: number;
    };
  } | null;
  proficiency?: {
    groups?: Record<string, { tier?: number }>;
    current?: { group?: string };
  };
  jobsV2?: {
    currentJobLevelCap?: number;
  } | null;
  skills?: {
    equipped?: string[];
    loadoutPresets?: { name: string; skills: string[] }[];
  };
};

type EquipmentResponse = {
  ok?: boolean;
  owned?: V2EquipInstance[];
  equipped?: Partial<Record<V2EquipSlot, string>>;
};

export function V2AdventureHome() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentResponse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { snapshot, loading, error, refresh: refreshDashboard, updatePreferences } =
    useAdventureDashboard();
  const {
    stamina,
    staminaMax,
    staminaRegenBonusPct,
    staminaPotions,
    refreshGameState,
  } = useGameState();

  const usePotion = useCallback(async (count: number) => {
    try {
      await fetch("/api/v2/me/use-stamina-potion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
    } catch {}
    await refreshGameState();
  }, [refreshGameState]);

  const refresh = useCallback(async () => {
    try {
      const [stateRes, equipmentRes] = await Promise.all([
        fetchGameState().then((response) =>
          response.ok ? response.json() : null,
        ),
        fetch("/api/v2/me/equipment").then((response) =>
          response.ok ? response.json() : null,
        ),
      ]);
      setState((stateRes as StateResponse | null) ?? { ok: false });
      setEquipment(equipmentRes as EquipmentResponse | null);
    } catch {
      setState({ ok: false });
      setEquipment(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 state 시드)
    refresh();
  }, [refresh]);

  const currentGroup = state?.proficiency?.current?.group ?? "none";
  const currentTier =
    currentGroup === "none"
      ? null
      : (state?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
  const levelCap = currentTier == null ? null : effectiveLevelCap(currentTier);
  const activePresetName = activeLoadoutPresetName(
    state?.skills?.loadoutPresets,
    state?.skills?.equipped,
  );
  const preferences =
    snapshot?.preferences ?? DEFAULT_ADVENTURE_HOME_PREFERENCES;
  const persistPreferences = (patch: Partial<AdventureHomePreferences>) => {
    setSaveError(null);
    void updatePreferences(patch).catch(() => {
      setSaveError("홈 설정을 저장하지 못해 이전 상태로 되돌렸습니다.");
    });
  };

  const characterWidget = state?.character ? (
    <CompactCharacterSummary
      character={state.character}
      guild={state.guild ?? null}
      levelCap={levelCap}
      activePresetName={activePresetName}
      adventureSupport={state.adventureSupport}
      activeFoodBuff={state.activeFoodBuff ?? null}
      activeGuildDiningEffect={state.activeGuildDiningEffect ?? null}
      equipped={equipment?.equipped}
      owned={equipment?.owned}
      expanded={preferences.characterExpanded}
      onExpandedChange={(characterExpanded) =>
        persistPreferences({ characterExpanded })
      }
    >
      <V2CharacterCard
        character={state.character}
        guild={state.guild ?? null}
        levelCap={levelCap}
        rejobRequiredLevel={state.jobsV2?.currentJobLevelCap ?? null}
        showGold={true}
        activePresetName={activePresetName}
        adventureSupport={state.adventureSupport}
        profileBorder={state.cosmetics?.profileBorder ?? null}
        chatNameEffect={state.cosmetics?.chatNameEffect ?? null}
        championshipBadge={state.cosmetics?.championshipBadge ?? null}
        activeFoodBuff={state.activeFoodBuff ?? null}
        profileShowcase={state.profileShowcase ?? null}
        profileShowcaseSlots={state.profileShowcaseSlots}
        profileMasteryTrophies={state.profileMasteryTrophies}
        profileBadgeStandOwned={state.profileBadgeStandOwned === true}
        profileBadgeStandVisible={state.profileBadgeStandVisible !== false}
        showcaseEditable
        onCollapse={() => persistPreferences({ characterExpanded: false })}
        equipped={equipment?.equipped}
        owned={equipment?.owned}
      />
    </CompactCharacterSummary>
  ) : null;

  const widgets: Partial<Record<AdventureHomeWidgetId, React.ReactNode>> = {
    character_summary: characterWidget,
    stamina: (
      <StaminaBar
        state={stamina}
        max={staminaMax}
        regenBonusPct={staminaRegenBonusPct}
        potions={staminaPotions}
        onUsePotion={usePotion}
      />
    ),
    activity_checklist: (
      <AdventureActivityChecklist
        activities={snapshot?.activities ?? []}
        summary={snapshot?.summary ?? { completed: 0, total: 0, actionableCount: 0 }}
        serverNow={snapshot?.serverNow}
        loading={loading}
        error={error}
        onRetry={() => void refreshDashboard()}
      />
    ),
    quest_rewards: <GuideQuestBanner />,
    hot_time: state?.hotTime ? <HotTimeBanner hotTime={state.hotTime} /> : null,
    announcements: <V2AnnouncementsPanel />,
    bulletin_preview: <RecentBulletinPreview />,
    ranking_preview: <AdventureRankingPreview />,
  };

  return (
    <PageShell spacing="tight" className="py-3 sm:py-6">
      {saveError && (
        <StatusBanner tone="error" role="status">
          {saveError}
        </StatusBanner>
      )}
      <AdventureHomeWidgetGrid
        order={preferences.widgetOrder}
        hidden={preferences.hiddenWidgetIds}
        widgets={widgets}
      />
    </PageShell>
  );
}

function HotTimeBanner({ hotTime }: { hotTime: NonNullable<StateResponse["hotTime"]> }) {
  const endsAt = Date.parse(hotTime.endsAt);
  const remainingMs = Number.isFinite(endsAt)
    ? Math.max(0, endsAt - hotTime.serverNow)
    : 0;
  const bonusLabels = [
    hotTime.bonuses.goldPct > 0 ? `골드 +${hotTime.bonuses.goldPct}%` : "",
    hotTime.bonuses.expPct > 0 ? `EXP +${hotTime.bonuses.expPct}%` : "",
    hotTime.bonuses.masteryPct > 0 ? `숙련 +${hotTime.bonuses.masteryPct}%` : "",
    hotTime.bonuses.fishingCoinPct > 0
      ? `낚시 코인 +${hotTime.bonuses.fishingCoinPct}%`
      : "",
  ].filter(Boolean);
  return (
    <section className={`${SURFACE_ACCENT} px-4 py-3 text-amber-950 dark:text-amber-100`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            핫타임 {hotTime.title || "이벤트"}
          </div>
          <div className="mt-0.5 text-xs">
            {bonusLabels.length > 0 ? bonusLabels.join(" · ") : "보너스 적용 중"}
          </div>
        </div>
        <Inset className="px-2 py-1 text-xs font-medium tabular-nums">
          {formatRemaining(remainingMs)}
        </Inset>
      </div>
    </section>
  );
}

function formatRemaining(ms: number) {
  const totalMin = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}분 남음`;
  return `${h}시간 ${m}분 남음`;
}
