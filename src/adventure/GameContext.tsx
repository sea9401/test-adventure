"use client";

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { BattleEndPayload, BattleView } from "@/adventure/BattleView";
import type { Character, Skill } from "@/adventure/character/types";
import type { SkillLayout } from "@/adventure/character/skills";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";
import type { useAutoPotionConfig } from "@/adventure/inventory/useAutoPotionConfig";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { useParagonState } from "@/adventure/character/useParagonState";
import type { useCrafting } from "@/adventure/crafting/useCrafting";
import type { EquipPicks } from "@/adventure/crafting/types";
import type { useTrialUnlocks } from "@/adventure/edges/useTrialUnlocks";
import type { useInboxCount } from "@/adventure/marketplace/useInboxCount";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useNotifications } from "@/adventure/notifications/useNotifications";
import type { useProfile } from "@/adventure/profile/useProfile";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useShopUnlocks } from "@/adventure/shop/useShopUnlocks";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useTraining } from "@/adventure/training/useTraining";
import type { TrialEdge } from "@/adventure/TrialView";
import type { ConsumableId } from "@/adventure/data/consumables";
import type { RuneGrade, RuneId } from "@/adventure/data/runes";
import type { ItemId, EquipSlot } from "@/adventure/data/items";
import type { CraftTier } from "@/adventure/data/craftQuality";
import type { DropQuality } from "@/adventure/data/dropQuality";
import type { MaterialId } from "@/adventure/data/materials";
import type { PotionId } from "@/adventure/data/potions";
import type { Recipe } from "@/adventure/data/recipes";
import type { StatKey } from "@/adventure/data/stats";
import type { Region, RegionId } from "@/adventure/data/world";
import type { MapProgress } from "@/lib/map-progress";
import type {
  NotificationKind,
  NotificationMeta,
} from "@/lib/notifications";
import type { RemoteSave } from "@/lib/storage/remote";
import type { TabKey } from "@/lib/useNavTabs";
import type { GuildBuffSlot } from "@/adventure/data/guildBuffs";
import type { AutoHuntHook } from "@/adventure/hunting/useAutoHunt";

type PlayerCombat = React.ComponentProps<typeof BattleView>["player"];
type PlayerStatus = React.ComponentProps<typeof BattleView>["playerStatus"];

// 게임 전역 컨텍스트 — page.tsx Home() 에서 한 번 빌드해 모든 Screen 에 주입.
// Screen 들은 useGame() 으로 필요한 부분만 골라서 사용 → props 폭발 해소.
export type GameCtx = {
  // — Hooks (반환 객체 통째 노출. 일부만 쓸 때도 destructure 해서 사용) —
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  paragon: ReturnType<typeof useParagonState>;
  training: ReturnType<typeof useTraining>;
  crafting: ReturnType<typeof useCrafting>;
  quests: ReturnType<typeof useQuests>;
  adventureLog: ReturnType<typeof useAdventureLog>;
  notifications: ReturnType<typeof useNotifications>;
  trialUnlocks: ReturnType<typeof useTrialUnlocks>;
  storyFlags: ReturnType<typeof useStoryFlags>;
  shopUnlocks: ReturnType<typeof useShopUnlocks>;
  autoPotion: ReturnType<typeof useAutoPotionConfig>;
  remote: RemoteSave;
  inbox: ReturnType<typeof useInboxCount>;
  profile: ReturnType<typeof useProfile>;

  // — 파생값 (캐릭터/월드/전투) —
  character: Character;
  currentRegion: Region;
  isTown: boolean;
  effectiveSkillNameList: string[];
  /** 보유 특기 (도감/스킬 화면 표시용). */
  characterFeats: Skill[];
  /** 장착 중인 특기 이름들 — 슬롯 인덱스를 보존. 길이 = featSlots, 빈 슬롯은 null. */
  effectiveFeatNames: (string | null)[];
  /** 현재 스킬 슬롯 레이아웃 (일반 칸 수 / 특기 칸 수). */
  skillLayout: SkillLayout;
  trainingDescription: string;
  playerCombat: PlayerCombat;
  playerStatus: PlayerStatus;
  /** 베이스 + 분배 + 장비 보너스가 합산된 최종 스탯. character.stats 와 동일한 값. */
  totalStats: Record<StatKey, number>;
  /** 베이스 + 분배 만 합산 (장비 보너스 제외). 두 값의 차이가 UI 의 "장비 +N" 표시. */
  baseAllocatedStats: Record<StatKey, number>;

  // — 지도 / 모험 임시 상태 —
  mapProgress: MapProgress;
  setMapProgress: Dispatch<SetStateAction<MapProgress>>;
  pendingTownNpcId: string | null;
  setPendingTownNpcId: Dispatch<SetStateAction<string | null>>;
  trialEdge: TrialEdge | null;
  /** 영구 저장된 누적 승수. trialEdge 가 null 이면 0. */
  trialWinCount: number;
  startTrial: (edge: TrialEdge) => void;
  endTrial: () => void;
  recordTrialWin: (winCount: number) => void;
  huntingActive: boolean;
  setHuntingActive: (next: boolean) => void;
  /** 타이머형 자동 사냥(6시간 원정) — dispatch/collect + 카운트다운 state. */
  autoHunt: AutoHuntHook;

  // — 길드 버프 — 전투/퀘스트 보상 곱셈 + 보스 시도 가산에 사용. 비가입/미설치는 [].
  guildBuffs: GuildBuffSlot[];
  refreshGuildBuffs: () => Promise<void>;

  // — 네비게이션 —
  tab: TabKey;
  subView: string | null;
  setSubView: (next: string | null) => void;
  back: () => void;

  // — 핸들러 —
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
  /** 칭호 부여 — idempotent. 신규 등록 시 토스트 동반. */
  grantTitle: (titleId: string) => void;
  handlePurchasePotion: (id: PotionId, quantity: number) => void;
  handlePurchaseMaterial: (id: MaterialId, quantity: number) => void;
  handlePurchaseConsumable: (id: ConsumableId, quantity: number) => void;
  handlePurchaseEquipment: (id: ItemId, quantity: number) => void;
  /** 룬 상점 구매 — tower_token 으로 가격 차감, inventory.runes 에 가산. */
  handlePurchaseRune: (id: RuneId, grade: RuneGrade, quantity?: number) => void;
  /** 마을 귀환 주문서 사용. 성공 시 true, 조건 미달/소비 실패 시 false. */
  handleUseTownReturn: (townId: RegionId) => boolean;
  /** 보스/고탑 등 비-마을 지역으로 빠른이동. 무조건 주문서 1개 소비. */
  handleUseTravelScroll: (regionId: RegionId) => boolean;
  handleSellPotion: (id: PotionId, quantity: number) => void;
  handleSellMaterial: (id: MaterialId, quantity: number) => void;
  handleSellEquipment: (
    id: ItemId,
    quantity: number,
    craftTier?: CraftTier,
    dropQuality?: DropQuality,
  ) => void;
  handleEquipFromInventory: (
    id: ItemId,
    tier?: CraftTier,
    quality?: DropQuality,
  ) => void;
  /** 인스턴스 기반 장비 장착 (별빛 재단 무구). */
  handleEquipInstanceFromInventory: (instanceId: string) => void;
  handleUnequip: (slot: EquipSlot) => void;
  /** 가방 장비 1개 → 모험의 서 보관함. */
  handleDepositToVault: (
    id: ItemId,
    tier?: CraftTier,
    quality?: DropQuality,
  ) => void;
  /** 모험의 서 보관함 → 가방 (variantKey: "base"|"c±N"|"dN"). */
  handleWithdrawFromVault: (id: ItemId, variantKey: string) => void;
  handleCraft: (
    recipe: Recipe,
    quantity?: number,
    equipPicks?: EquipPicks,
  ) => void;
  /** 별빛 무구 +1 강화 시도 (서버 권위). 인스턴스 ID + 확률 모드. 실패 시 가능 횟수 -1. */
  handleEnhance: (
    instanceId: string,
    mode: import("./character/enhancement").EnhanceMode,
  ) => void;
  /** 별빛 무구 마법부여 (서버 권위). 인스턴스 ID + 부여서 materialId. 슬롯 1개 부여. */
  handleEnchant: (instanceId: string, materialId: string) => void;
  /**
   * NPC 1회성 대화 보상 수령 (서버 권위). dialogueId 만 보내고 서버가 character/
   * inventory/storyFlags 를 mutate. onSuccess 는 dialogue 닫기 등.
   */
  claimDialogueReward: (
    dialogueId: import("@/adventure/data/dialogueRewards").DialogueRewardId,
    opts?: { onSuccess?: () => void },
  ) => Promise<void>;
  handleBattleEnd: (payload: BattleEndPayload) => void;
  handleAcceptQuest: (id: string) => void;
  handleClaimQuest: (id: string) => void;
  completeQuest: (id: string) => boolean;
};

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({
  value,
  children,
}: {
  value: GameCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameCtx {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useGame must be used inside <GameProvider>");
  }
  return v;
}
