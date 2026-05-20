"use client";

import { Suspense, useEffect, useState } from "react";
import { setForegroundHunting } from "@/lib/huntingSignal";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Coins, MapPin } from "@phosphor-icons/react";
import { SettingsMenu } from "@/components/SettingsMenu";
import { ChatButton } from "@/components/ChatButton";
import { type BattleEndPayload } from "@/adventure/BattleView";
import { TownScreen } from "@/adventure/TownScreen";
import { CharacterScreen } from "@/adventure/CharacterScreen";
import { AdventureScreen } from "@/adventure/AdventureScreen";
import { PlazaScreen } from "./PlazaScreen";
import { QuickTravelScreen } from "./QuickTravelScreen";
import { GameProvider, type GameCtx } from "@/adventure/GameContext";
import { useAdventureLog } from "@/adventure/log/useAdventureLog";
import { WORLD_MAP } from "@/adventure/data/world";
import {
  initialMapProgress,
  type MapProgress,
} from "@/lib/map-progress";
import { START_REGION_ID } from "@/adventure/data/world";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationToast } from "@/components/NotificationToast";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { useQuests } from "@/adventure/quests/useQuests";
import { useInventory } from "@/adventure/inventory/useInventory";
import { POTION_IDS, POTIONS } from "@/adventure/data/potions";
import { useInboxCount } from "@/adventure/marketplace/useInboxCount";
import { useRemoteSave } from "@/lib/storage/SaveProvider";
import { useAutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";
import { useCrafting } from "@/adventure/crafting/useCrafting";
import type { NotificationKind, NotificationMeta } from "@/lib/notifications";
import { useNotifications } from "@/adventure/notifications/useNotifications";
import { RegionBackground } from "@/components/ui/RegionBackground";
import { formatDuration } from "@/lib/format";
import { ZERO_ALLOCATED } from "@/adventure/character/statMeta";
import { useTraining } from "@/adventure/training/useTraining";
import { baseCharacter } from "@/adventure/character/defaults";
import { useCharacterState } from "@/adventure/character/useCharacterState";
import { useParagonState } from "@/adventure/character/useParagonState";
import { useProfile } from "@/adventure/profile/useProfile";
import { useTrialUnlocks } from "@/adventure/edges/useTrialUnlocks";
import { composeCharacter } from "@/adventure/character/composeCharacter";
import { useTitleGrants } from "@/adventure/character/useTitleGrants";
import { useLevelUpDetection } from "@/adventure/character/useLevelUpDetection";
import { useRespawnSafetyNet } from "@/adventure/character/useRespawnSafetyNet";
import { getTitle } from "@/adventure/data/titles";
import { onBattleEnd } from "@/adventure/battle/onBattleEnd";
import { useBattleClaimAction } from "@/adventure/battle/useBattleClaimAction";
import { useAutoHunt } from "@/adventure/hunting/useAutoHunt";
// 자동사냥 결과 모달 — 결과가 있을 때만 마운트. 메인 페이지 초기 번들에서 분리해
// 라우트 진입 시 다운로드 안 함. 결과 발생 시 (드물게) 동적 로드.
const AutoHuntResultModal = dynamic(
  () =>
    import("@/adventure/battle/AutoHuntResultModal").then((m) => ({
      default: m.AutoHuntResultModal,
    })),
  { ssr: false },
);
import { useAutoHuntResultHandler } from "@/adventure/hunting/useAutoHuntResultHandler";
import { useOneTimeNotices } from "@/adventure/notifications/useOneTimeNotices";
import { useGuildBuffsCache } from "@/adventure/guild/useGuildBuffsCache";
import { useShopUnlocks } from "@/adventure/shop/useShopUnlocks";
import { useShopActions } from "@/adventure/shop/useShopActions";
import { useEquipmentActions } from "@/adventure/inventory/useEquipmentActions";
import { useCraftAction } from "@/adventure/crafting/useCraftAction";
import { useEnhanceAction } from "@/adventure/character/useEnhanceAction";
import { useEnchantAction } from "@/adventure/character/useEnchantAction";
import { useDialogueRewardAction } from "@/adventure/town/dialogues/useDialogueRewardAction";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import {
  TUTORIAL_ENABLED_FLAG,
  TUTORIAL_FLAG_PREFIX,
} from "@/adventure/tutorial";
import { SaveProvider, useSavedValue } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import { useNavTabs } from "@/lib/useNavTabs";
import { MainTabs } from "./MainTabs";
import { usePresenceHeartbeat } from "@/lib/usePresenceHeartbeat";
import { useTrialState } from "@/adventure/trial/useTrialState";
import { useTitleGrant } from "@/adventure/quests/useTitleGrant";
import { useQuestActions } from "@/adventure/quests/useQuestActions";

export default function Page() {
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <Suspense fallback={null}>
        <Home />
      </Suspense>
    </SaveProvider>
  );
}

// 아직 캐릭터가 없으면 게임 화면 대신 /create 로 보낸다 (모달 → 별도 페이지).
function RedirectToCreate() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/create");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
      모험가를 만들러 가는 중...
    </div>
  );
}

function Home() {
  // tab/subView 는 URL 쿼리(?tab=...&sub=...)로 관리 → 브라우저 back/forward 가 in-app 이동을 따라감.
  const {
    tab,
    subView,
    setTab,
    setSubView,
    replaceSubView,
    replaceLocation,
    back,
  } = useNavTabs();

  // 자동 사냥 토글 — 이 세션·이 탭 한정 로컬 상태. 전투 화면에 머무는 동안에만 루프가
  // 돈다 (BattleView). 다른 탭/백그라운드로 가면 BattleView 가 unmount 되어 자연히 멈추고,
  // 돌아오면 다시 이어진다. 오프라인 누적·서버 동기화 없음 — "그 창에서만 전투".
  const [huntingActive, setHuntingActive] = useState(false);
  // VersionCheck(root, GameContext 밖)가 새 배포 자동 새로고침을 사냥 중엔 미루도록 신호 미러링.
  useEffect(() => {
    setForegroundHunting(huntingActive);
    return () => setForegroundHunting(false);
  }, [huntingActive]);
  const trial = useTrialState({ tab, subView });

  // 마을 진입 직후 자동으로 열 NPC 대화 — 알림판 클릭 시 세팅, TownView 가 마운트 직후 소비.
  const [pendingTownNpcId, setPendingTownNpcId] = useState<string | null>(null);

  const initialMap = useSavedValue<Partial<MapProgress>>("map.v2");
  const [mapProgress, setMapProgress] = useState<MapProgress>(() => ({
    currentRegionId: initialMap?.currentRegionId ?? initialMapProgress.currentRegionId,
    visitedRegionIds:
      initialMap?.visitedRegionIds && initialMap.visitedRegionIds.length > 0
        ? initialMap.visitedRegionIds
        : initialMapProgress.visitedRegionIds,
    respawnRegionId:
      initialMap?.respawnRegionId ?? initialMapProgress.respawnRegionId,
  }));
  useRemotePatch("map.v2", mapProgress);
  const adventureLog = useAdventureLog();
  const quests = useQuests();
  const crafting = useCrafting();
  const inventory = useInventory();
  const remote = useRemoteSave();
  const inbox = useInboxCount();
  const autoPotion = useAutoPotionConfig();
  // notifications 를 autoHunt 보다 먼저 만들어 useAutoHunt 의 onCollectError 콜백에
  // 토스트 함수를 넘긴다. (수령 실패 시 사용자에게 신호 없는 문제 방지.)
  const notifications = useNotifications();
  // 타이머형 자동 사냥(6시간 원정) — dispatch/collect + 카운트다운. 라이브 huntingActive 와 별개.
  // collect 시 디바이스 자동 포션 룰을 서버 sim 에 전달 (서버에 동기화 안 됨).
  const autoHunt = useAutoHunt({
    getAutoPotionRules: () => autoPotion.config.rules,
    onCollectError: (msg) => notifications.add("info", msg),
  });
  const training = useTraining();
  // 파라곤 — 100레벨 도달 후 잉여 EXP 적립처. characterStateHook 보다 먼저 만들어
  // onParagonOverflow 콜백으로 주입. PR-A 범위에선 적립만 하고 UI/효과는 후속 PR.
  const paragon = useParagonState();
  const characterStateHook = useCharacterState({
    onParagonOverflow: paragon.addParagonExp,
  });
  const characterState = characterStateHook.state;
  const profile = useProfile();
  const trialUnlocks = useTrialUnlocks();
  const storyFlags = useStoryFlags();
  const shopUnlocks = useShopUnlocks();

  // 마을 탭에 있는데 현재 위치가 마을이 아니면 서브뷰 강제 종료
  useEffect(() => {
    const currentTags = WORLD_MAP.regions.find(
      (r) => r.id === mapProgress.currentRegionId,
    )?.tags;
    const inTown = currentTags?.includes("town") ?? false;
    if (tab === "town" && !inTown) {
      replaceSubView(null);
    }
    // replaceSubView 는 router 의 안정 참조 — deps 에서 제외해도 안전.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mapProgress.currentRegionId]);

  // setTab 은 항상 sub 를 비우므로 추가 처리 없음.
  const handleTabChange = setTab;

  const trainingDescription = training.isTraining
    ? `훈련 중 · ${formatDuration(training.remaining)}`
    : training.unspentPoints > 0
      ? `단련 포인트 ${training.unspentPoints}개 보유`
      : "능력치를 단련할 수 있는 곳.";

  // 전투 전적 = 누적 처치 + 누적 패배. 도주 경로가 없어 둘의 합이 곧 전투 횟수.
  const totalMonsterKills = Object.values(adventureLog.log.monsters).reduce(
    (sum, m) => sum + (m.kills ?? 0),
    0,
  );
  const battleCount =
    totalMonsterKills + (adventureLog.log.battleLosses ?? 0);

  const equippedTitle = getTitle(characterStateHook.equippedTitleId);

  // 스탯/장비/스킬/HP 합산 → PlayerCombat + Character 단일 source-of-truth.
  // derivePlayerCombat 을 내부에서 호출 — 서버 협동 보스도 같은 함수로 재현해 클라이언트
  // 위변조 차단. 변경 시 derivePlayerCombat.ts 의 스탯 변환 규칙과 동기화 필수.
  const composed = composeCharacter({
    level: characterState.level,
    baseStats: baseCharacter.stats,
    allocatedStats: training.allocatedStats ?? ZERO_ALLOCATED,
    equipped: characterStateHook.equippedSlots,
    equippedSkills: characterState.equippedSkills,
    learnedAPSkills: characterState.learnedAPSkills,
    apSkillConditions: characterState.apSkillConditions,
    equippedFeats: characterState.equippedFeats,
    equippedRunes: characterState.equippedRunes,
    paragonAllocations: paragon.state.allocations,
    storyFlagIds: new Set(storyFlags.state.flags),
    hp: characterState.hp,
    mp: characterState.mp,
    name: profile.name,
    gender: profile.gender,
    exp: characterState.exp,
    paragonExp: paragon.state.paragonExp,
    gold: characterState.gold,
    fame: characterState.fame,
    battleCount,
    titleName: equippedTitle?.name,
    affiliation:
      characterStateHook.state.affiliation ?? baseCharacter.affiliation,
  });
  const {
    character,
    player: playerCombat,
    totalStats,
    baseAllocatedStats,
    effectiveSkillNames: effectiveSkillNameList,
    effectiveFeatNames,
    characterSkills,
    characterFeats,
    layout: skillSlotLayout,
  } = composed;

  usePresenceHeartbeat({
    name: character.name,
    className: character.className,
    title: character.titleName ?? null,
  });
  const guildBuffsCache = useGuildBuffsCache();

  const showModal = profile.needsSetup;
  const currentRegion =
    WORLD_MAP.regions.find((r) => r.id === mapProgress.currentRegionId) ??
    WORLD_MAP.regions[0];
  const isTown = currentRegion.tags?.includes("town") ?? false;

  useEffect(() => {
    adventureLog.markRegionVisited(currentRegion.id);
    // visit_region 의뢰 진행도 — 지역 진입 시 1회 누적.
    quests.recordVisit(currentRegion.id);
  }, [currentRegion.id, adventureLog, quests]);

  // 인벤토리·장착 상태가 바뀔 때마다 보유/장착 중인 장비를 모험의 서 도감에 등록.
  // 폐기·판매로 빠진 것은 도감에서 사라지지 않는다. 마운트 시 기존 보유분도 한 번 백필.
  const syncDiscoveredEquipment = adventureLog.syncDiscoveredEquipment;
  useEffect(() => {
    syncDiscoveredEquipment(inventory.state, characterStateHook.equippedSlots);
    // equip_item / equip_set 의뢰 — 장착 조건 충족 시 active → ready.
    quests.checkEquip(characterStateHook.equippedSlots);
  }, [inventory.state, characterStateHook.equippedSlots, syncDiscoveredEquipment, quests]);

  // HP<=0 인데 마을이 아닌 곳에 stuck 된 유저를 다음 진입 때 복귀 마을로 강제 이동.
  useRespawnSafetyNet({
    hp: characterState.hp,
    isTown,
    mapProgress,
    setMapProgress,
    setHp: characterStateHook.setHp,
    setHuntingActive,
    replaceSubView,
  });

  // HP 회복약 보유 총합 (전투씬 표시용). 모든 heal_hp 효과 포션을 합산 — 새 종류가
  // 추가돼도 자동 포함되도록 effect.kind 로 필터.
  const hpPotionCount = POTION_IDS.reduce((sum, id) => {
    if (POTIONS[id].effect.kind !== "heal_hp") return sum;
    return sum + (inventory.state.potions[id] ?? 0);
  }, 0);

  const playerStatus = {
    gender: character.gender,
    exp: character.exp,
    maxExp: character.maxExp,
    hpPotionCount,
  };

  const addNotification = (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => notifications.add(kind, text, meta);

  useOneTimeNotices({
    level: characterState.level,
    tab,
    subView,
    trial,
    addNotification,
  });

  // 레벨업/스킬·특기 획득/슬롯 해금 감지 → 알림 + 오버레이 트리거.
  const { levelUpTrigger } = useLevelUpDetection({
    level: characterState.level,
    characterSkills,
    characterFeats,
    normalSlots: skillSlotLayout.normalSlots,
    featSlots: skillSlotLayout.featSlots,
    addPoints: training.addPoints,
    addNotification: (kind, text) => addNotification(kind, text),
  });

  // 칭호 등록은 "획득 시"가 트리거 — 신규로 등록되는 시점에만 토스트.
  // 이미 획득한 칭호엔 무반응 (markTitleObtained 자체가 idempotent).
  const { grantTitle } = useTitleGrant({ adventureLog, addNotification });

  const { handleAcceptQuest, completeQuest, handleClaimQuest } = useQuestActions(
    {
      quests,
      inventory,
      characterStateHook,
      paragon,
      crafting,
      storyFlags,
      adventureLog,
      grantTitle,
      addNotification,
    },
  );

  const {
    handlePurchasePotion,
    handlePurchaseMaterial,
    handlePurchaseConsumable,
    handlePurchaseEquipment,
    handlePurchaseRune,
    handleUseTownReturn,
    handleUseTravelScroll,
    handleSellPotion,
    handleSellMaterial,
    handleSellEquipment,
  } = useShopActions({
    characterStateHook,
    inventory,
    shopUnlocks,
    mapProgress,
    setMapProgress,
    addNotification,
    grantTitle,
  });

  const {
    handleEquipFromInventory,
    handleEquipInstanceFromInventory,
    handleUnequip,
    handleDepositToVault,
    handleWithdrawFromVault,
  } = useEquipmentActions({ inventory, characterStateHook, addNotification });

  const { handleCraft } = useCraftAction({
    inventory,
    crafting,
    addNotification,
    grantTitle,
    recordCraft: quests.recordCraft,
  });

  const { handleEnhance } = useEnhanceAction({ inventory, addNotification });
  const { handleEnchant } = useEnchantAction({ inventory, addNotification });
  const { claim: claimDialogueReward } = useDialogueRewardAction({
    inventory,
    characterStateHook,
    storyFlags,
    addNotification,
  });

  // 카운터/상태/시간 기반 자동 칭호 부여.
  const maxNpcTalkCount = Object.values(adventureLog.log.npcs).reduce(
    (max, e) => Math.max(max, e?.talkCount ?? 0),
    0,
  );
  const maxMaterialSold = Object.values(shopUnlocks.state.sold).reduce(
    (max, n) => Math.max(max, n ?? 0),
    0,
  );
  useTitleGrants(grantTitle, {
    battleLosses: adventureLog.log.battleLosses ?? 0,
    trainingCount: training.completedCount,
    chatCount: adventureLog.log.chatCount ?? 0,
    healingCount: adventureLog.log.healingCount ?? 0,
    gold: characterState.gold,
    level: characterState.level,
    maxNpcTalkCount,
    totalStats,
    allRegionsVisited:
      new Set(mapProgress.visitedRegionIds).size >= WORLD_MAP.regions.length,
    luckyCollected: storyFlags.has("bard_lucky_collected"),
    cipherDone: storyFlags.has("cipher_done"),
    heroSwordRestored: storyFlags.has("hero_sword_restored"),
    maxMaterialSold,
  });

  const { claim: claimBattleVictory } = useBattleClaimAction({
    inventory,
    characterStateHook,
    crafting,
    paragon,
    adventureLog,
    storyFlags,
    quests,
  });
  const handleBattleEnd = (payload: BattleEndPayload) =>
    void onBattleEnd(payload, {
      claimVictory: claimBattleVictory,
      inventory: { consume: inventory.consume },
      adventureLog: {
        markTitleObtained: grantTitle,
        incrementBattleLosses: adventureLog.incrementBattleLosses,
      },
      characterState: {
        setHp: characterStateHook.setHp,
      },
      respawnRegionId: mapProgress.respawnRegionId ?? START_REGION_ID,
      addNotification,
      setHuntingActive,
      replaceLocation,
      setMapProgress,
    });

  const { autoHuntResult, dismiss: dismissAutoHuntResult } =
    useAutoHuntResultHandler({
      replaceLocation,
      addNotification,
    });

  const gameCtx: GameCtx = {
    inventory,
    characterStateHook,
    paragon,
    training,
    crafting,
    quests,
    adventureLog,
    notifications,
    trialUnlocks,
    storyFlags,
    shopUnlocks,
    autoPotion,
    remote,
    inbox,
    profile,
    character,
    currentRegion,
    isTown,
    effectiveSkillNameList,
    effectiveFeatNames,
    characterFeats,
    skillLayout: skillSlotLayout,
    trainingDescription,
    playerCombat,
    playerStatus,
    totalStats,
    baseAllocatedStats,
    mapProgress,
    setMapProgress,
    pendingTownNpcId,
    setPendingTownNpcId,
    trialEdge: trial.edge,
    trialWinCount: trial.winCount,
    startTrial: trial.start,
    endTrial: trial.end,
    recordTrialWin: trial.recordWin,
    huntingActive,
    setHuntingActive,
    autoHunt,
    guildBuffs: guildBuffsCache.buffs,
    refreshGuildBuffs: guildBuffsCache.refresh,
    tab,
    subView,
    setSubView,
    back,
    addNotification,
    grantTitle,
    handlePurchasePotion,
    handlePurchaseMaterial,
    handlePurchaseConsumable,
    handlePurchaseEquipment,
    handlePurchaseRune,
    handleUseTownReturn,
    handleUseTravelScroll,
    handleSellPotion,
    handleSellMaterial,
    handleSellEquipment,
    handleEquipFromInventory,
    handleEquipInstanceFromInventory,
    handleUnequip,
    handleDepositToVault,
    handleWithdrawFromVault,
    handleCraft,
    handleEnhance,
    handleEnchant,
    claimDialogueReward,
    handleBattleEnd,
    handleAcceptQuest,
    handleClaimQuest,
    completeQuest,
  };

  if (showModal) return <RedirectToCreate />;

  return (
    <GameProvider value={gameCtx}>
      <RegionBackground regionId={currentRegion.id} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("adventure")}
              className="inline-flex items-center gap-1 truncate rounded-md text-base font-semibold text-zinc-700 transition-colors hover:text-emerald-600 dark:text-zinc-200 dark:hover:text-emerald-400"
            >
              <MapPin size={16} weight="fill" className="text-emerald-500" />
              {currentRegion.name}
            </button>
            {huntingActive && currentRegion.enemies.length > 0 && (
              <span
                title="라이브 자동 전투 진행 중"
                aria-label="라이브 자동 전투 진행 중"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
              >
                <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                사냥
              </span>
            )}
            {autoHunt.isDispatched && (
              <span
                title="자동 사냥(원정) 진행 중"
                aria-label="자동 사냥 원정 진행 중"
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-500/50 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-sky-700 dark:text-sky-300"
              >
                <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                {autoHunt.state === "complete"
                  ? "원정 완료"
                  : `원정 ${Math.floor(autoHunt.remainingMs / 60_000)}:${String(
                      Math.floor(autoHunt.remainingMs / 1000) % 60,
                    ).padStart(2, "0")}`}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
              <Coins size={20} weight="fill" className="text-yellow-500" />
              {character.gold >= 10_000
                ? `${Math.floor(character.gold / 1000)}K`
                : character.gold.toLocaleString()}
            </span>
            <NotificationBell
              notifications={notifications.bellList}
              unreadCount={notifications.unreadCount}
              onOpen={notifications.markRead}
            />
            <ChatButton
              name={character.name}
              className={character.className}
              title={character.titleName ?? null}
              onSent={adventureLog.incrementChatCount}
            />
            <SettingsMenu
              gameName={character.name}
              tutorialEnabled={storyFlags.has(TUTORIAL_ENABLED_FLAG)}
              onReplayTutorial={() => {
                storyFlags.removeWithPrefix(TUTORIAL_FLAG_PREFIX);
                storyFlags.set(TUTORIAL_ENABLED_FLAG);
                addNotification("info", "튜토리얼을 다시 표시합니다.");
              }}
              onToggleTutorial={() => {
                if (storyFlags.has(TUTORIAL_ENABLED_FLAG)) {
                  storyFlags.remove(TUTORIAL_ENABLED_FLAG);
                  addNotification("info", "튜토리얼을 껐어요.");
                } else {
                  storyFlags.set(TUTORIAL_ENABLED_FLAG);
                  addNotification("info", "튜토리얼을 켰어요.");
                }
              }}
            />
          </div>
        </header>

        <MainTabs active={tab} onChange={handleTabChange} />

        <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 sm:p-6">
          {tab === "adventure" && <AdventureScreen />}
          {tab === "town" && <TownScreen />}
          {tab === "character" && <CharacterScreen />}
          {tab === "plaza" && <PlazaScreen />}
          {tab === "quickTravel" && <QuickTravelScreen />}
        </main>
      </div>
      <NotificationToast notifications={notifications.list} />
      <LevelUpOverlay level={character.level} triggerKey={levelUpTrigger} />
      {autoHuntResult && (
        <AutoHuntResultModal
          result={autoHuntResult}
          onClose={dismissAutoHuntResult}
        />
      )}
    </GameProvider>
  );
}
