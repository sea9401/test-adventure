"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { fetchGameState } from "./fetchGameState";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  CheckCircle,
  Package,
  Question,
  Sword,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  MAX_FRONTIER_DEPTH,
  dungeonThemeCatalog,
} from "@/adventure/data/v2/dungeon";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  dropPoolForDepth,
  type FloorEquipDropPool,
} from "@/adventure/data/v2/dungeonEquipDrops";
import {
  uniqueIdsForDepthRange,
  bandUniquePoolForDepth,
  bandCommonChanceForDepth,
  commonIdsForDepthRange,
  SKY_RIFT_WEAPON_DROP_CHANCE,
  SKY_RIFT_WEAPON_IDS,
} from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  V2_EQUIPMENT,
  isUnique,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2ItemCard,
  anchorOf,
  type ItemCardAnchor,
} from "./V2ItemCard";
import {
  FISHING_CODEX_SP_MILESTONES,
  fishCodexSpBonusForCount,
  nextFishCodexMilestone,
} from "@/adventure/v2/fishingCodex";
import { EQUIPMENT_CODEX_SP_MILESTONES } from "@/adventure/data/v2/equipmentCodex";
import {
  FISH,
  FISH_IDS,
  type FishId,
} from "@/adventure/data/v2/fish";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";
import type { V2LoadoutSpBreakdown } from "./V2LoadoutPanel";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  parseSpFruitUsed,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID } from "@/adventure/data/v2/stormExpeditionRewards";
import { TutorialOverlayInner } from "@/adventure/tutorial/TutorialOverlay";
import { TUTORIAL_CODEX_INTRO } from "@/adventure/tutorial/flags";
import { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import {
  commonHuntMaterialDrops,
  formatHuntMaterialDropChance,
  regionalHuntMaterialDrops,
  type HuntMaterialDropCatalogEntry,
} from "@/adventure/data/v2/huntMaterialCatalog";
import {
  FishSpecimenExtractModal,
  type FishSpecimenExtractProjection,
} from "./FishSpecimenExtractModal";
import { useRefreshGameState } from "./GameStateRefreshContext";
import { useEquipmentCodexContext } from "./GameStateProvider";
import { useSystemToast } from "./RewardToastProvider";
import type { CodexMasteryPanelState } from "./CodexMasteryPanel";
import { useCodexResearchRanking } from "@/adventure/rankings/useCodexResearchRanking";
import type {
  CodexMasteryOverviewResponse,
  CodexMasteryPinnedGoal,
} from "@/adventure/data/v2/codexMasteryView";

const JobCodexList = dynamic(() =>
  import("./V2JobCodexView").then((module) => module.JobCodexList),
);
const CodexEquipmentPanel = dynamic(() =>
  import("./CodexEquipmentPanel").then(
    (module) => module.CodexEquipmentPanel,
  ),
);
const CodexTitlePanel = dynamic(() =>
  import("./CodexTitlePanel").then((module) => module.CodexTitlePanel),
);
const LifeFieldCodexPanel = dynamic(() =>
  import("./LifeFieldPanels").then((module) => module.LifeFieldCodexPanel),
);
const CookingCodexPanel = dynamic(() =>
  import("./CookingCodexPanel").then((module) => module.CookingCodexPanel),
);
const FishingCodexPanel = dynamic(() =>
  import("./FishingCodexPanel").then((module) => module.FishingCodexPanel),
);
const CodexMasteryPanel = dynamic(() =>
  import("./CodexMasteryPanel").then((module) => module.CodexMasteryPanel),
);

// v2 모험의 서 — 사냥터(장비·재료 드랍) + 어보(어종) + 직업(거쳐온 직업/스킬 수집) 탭.
// 정적 카탈로그(전종 공개)는 /me/state 가 발견 여부 권위. 직업 도감만 별도(/api/v2/me/job-codex, lazy).

export const SKY_RIFT_CODEX_DROP_SUMMARY =
  "모든 난이도 동일 방어구 풀 · 깊이별 총 0.05~0.10%";

export function codexUniqueDropSummary(depthStart: number): string {
  const pool = bandUniquePoolForDepth(depthStart);
  if (pool?.minDepth !== 79) return "매우 낮은 확률";
  return `처치당 총 ${(pool.chance * 100).toFixed(4)}% · 무작위 1종`;
}

type FishSpecimenExtractResponse = Partial<FishSpecimenExtractProjection> & {
  ok?: boolean;
  error?: string;
  registeredIds?: string[];
};

function projectionFromExtractResponse(
  response: FishSpecimenExtractResponse | null,
): FishSpecimenExtractProjection | null {
  if (
    !response ||
    typeof response.fishSpBefore !== "number" ||
    typeof response.fishSpAfter !== "number" ||
    typeof response.totalSpBefore !== "number" ||
    typeof response.totalSpAfter !== "number" ||
    typeof response.spLoss !== "number" ||
    typeof response.equippedSpUsed !== "number" ||
    typeof response.overBudget !== "boolean"
  ) {
    return null;
  }
  return {
    fishSpBefore: response.fishSpBefore,
    fishSpAfter: response.fishSpAfter,
    totalSpBefore: response.totalSpBefore,
    totalSpAfter: response.totalSpAfter,
    spLoss: response.spLoss,
    equippedSpUsed: response.equippedSpUsed,
    overBudget: response.overBudget,
  };
}
const CODEX_PANEL_SURFACE = `${SURFACE_INSET} p-2.5 sm:p-3`;

type FishingCodexMeta = {
  total: number;
  spBonus: number;
  milestones: number[];
  nextMilestone: number | null;
};

const defaultFishingCodexMeta = (discoveredCount = 0): FishingCodexMeta => ({
  total: FISH_IDS.length,
  spBonus: fishCodexSpBonusForCount(discoveredCount),
  milestones: [...FISHING_CODEX_SP_MILESTONES],
  nextMilestone: nextFishCodexMilestone(discoveredCount),
});

export type CodexTab =
  | "huntground"
  | "equipment"
  | "spFruit"
  | "mastery"
  | "fish"
  | "cooking"
  | "life"
  | "title"
  | "job";

const CODEX_TABS: readonly CodexTab[] = [
  "huntground",
  "equipment",
  "spFruit",
  "mastery",
  "fish",
  "cooking",
  "life",
  "title",
  "job",
];

export function codexTabFromParam(value: string | null): CodexTab {
  return CODEX_TABS.some((tab) => tab === value)
    ? (value as CodexTab)
    : "spFruit";
}

export const CODEX_TAB_ITEMS = [
  ["spFruit", "SP 수집"],
  ["mastery", "숙련"],
  ["job", "직업"],
  ["equipment", "장비"],
  ["huntground", "사냥터"],
  ["fish", "어보"],
  ["cooking", "요리"],
  ["life", "현장 기록"],
  ["title", "칭호"],
] as const satisfies ReadonlyArray<readonly [CodexTab, string]>;

type CodexMasteryLoadStatus = "idle" | CodexMasteryPanelState["status"];

export function shouldLoadCodexMastery(
  tab: CodexTab,
  status: CodexMasteryLoadStatus,
): boolean {
  return tab === "mastery" && status === "idle";
}

export function shouldShowCodexTutorial(
  hasSeen: boolean,
  replayRequested: boolean,
): boolean {
  return !hasSeen || replayRequested;
}

export function spFruitCodexSource(tier: SpFruitTier): string {
  const def = SP_FRUIT[tier];
  const sources: string[] = [];
  if (def.bossKind) {
    sources.push(`${COOP_BOSSES[def.bossKind]?.name ?? "협동 보스"} 보상`);
  }
  if (def.materialId === STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID) {
    sources.push("폭풍 원정 완주 보상");
  }
  return sources.join(" · ");
}

export function spEligibleJobProgress(
  jobs: Array<{ tier?: unknown; unlocked?: unknown }>,
): { current: number; total: number } {
  const eligibleJobs = jobs.filter(
    (job) => typeof job.tier === "number" && job.tier > 0,
  );
  return {
    current: eligibleJobs.filter((job) => job.unlocked === true).length,
    total: eligibleJobs.length,
  };
}

export function spCollectionSpRange({
  label,
  value,
  jobUnlockTotal,
}: {
  label: string;
  value: number;
  jobUnlockTotal: number;
}): { current: number; maximum: number } {
  const current = Number.isFinite(value) ? Math.trunc(value) : 0;
  const normalizedJobTotal = Number.isFinite(jobUnlockTotal)
    ? Math.max(0, Math.trunc(jobUnlockTotal))
    : 0;
  const configuredMaximum =
    label === "직업 해금"
      ? normalizedJobTotal
      : label === "어보"
        ? FISHING_CODEX_SP_MILESTONES.length
        : label === "장비 도감"
          ? EQUIPMENT_CODEX_SP_MILESTONES.length
          : current;

  return {
    current,
    maximum: Math.max(current, configuredMaximum),
  };
}

function equipPoolChance(pool: FloorEquipDropPool): number {
  return pool.chance;
}

export function codexEquipmentProgress(
  ids: Iterable<V2EquipmentId>,
  registeredIds: ReadonlySet<string>,
): {
  registeredCount: number;
  totalCount: number;
  complete: boolean;
} {
  const uniqueIds = new Set(ids);
  let registeredCount = 0;
  for (const id of uniqueIds) {
    if (registeredIds.has(id)) registeredCount += 1;
  }
  const totalCount = uniqueIds.size;
  return {
    registeredCount,
    totalCount,
    complete: totalCount > 0 && registeredCount === totalCount,
  };
}

function EquipmentRegistrationMark({
  registered,
}: {
  registered: boolean | undefined;
}) {
  if (registered === undefined) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-white px-1 py-px text-[9px] font-semibold text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
      {registered && <CheckCircle size={10} weight="fill" aria-hidden />}
      {registered ? "등록" : "미등록"}
    </span>
  );
}

// 드랍 목록의 아이템 칩 — 클릭하면 옵션 팝오버(V2ItemCard, 인벤과 동일)를 띄운다.
//   카탈로그 id 가 V2_EQUIPMENT 에 없으면(방어) 클릭 불가 라벨로만.
export function DropChip({
  id,
  kind,
  registered,
  onOpen,
}: {
  id: V2EquipmentId;
  kind: "common" | "set" | "unique";
  registered?: boolean;
  onOpen: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const tone =
    kind === "unique"
      ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
      : kind === "set"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  if (!item) {
    return (
      <span
        aria-label={
          registered === undefined
            ? undefined
            : `${id} · 장비 도감 ${registered ? "등록" : "미등록"}`
        }
        className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}
      >
        {id}
        <EquipmentRegistrationMark registered={registered} />
      </span>
    );
  }
  const hover =
    kind === "unique"
      ? "hover:bg-violet-200 dark:hover:bg-violet-900"
      : kind === "set"
        ? "hover:bg-emerald-200 dark:hover:bg-emerald-900"
        : "hover:bg-zinc-200 dark:hover:bg-zinc-700";
  return (
    <button
      type="button"
      onClick={(e) => onOpen(item, anchorOf(e.currentTarget))}
      aria-label={
        registered === undefined
          ? undefined
          : `${item.name} · 장비 도감 ${registered ? "등록" : "미등록"}`
      }
      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${tone} ${hover}`}
    >
      {item.name}
      {kind === "unique" && item.setId && (
        <span className="ml-1 rounded border border-current px-1 text-[9px]">
          세트
        </span>
      )}
      <EquipmentRegistrationMark registered={registered} />
    </button>
  );
}

const COMMON_HUNT_MATERIAL_DROPS = commonHuntMaterialDrops();

function MaterialDropGrid({
  entries,
}: {
  entries: readonly HuntMaterialDropCatalogEntry[];
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {entries.map((entry) => (
        <div
          key={`${entry.id}:${entry.source}`}
          className={`${SURFACE_INSET} flex min-h-[72px] items-start gap-2.5 p-2.5`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Package size={18} weight="duotone" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold leading-5 text-zinc-900 dark:text-zinc-100">
                {entry.name}
              </span>
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {formatHuntMaterialDropChance(entry.chancePct)}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              <span>{entry.source} · 승리 시 1개</span>
              {entry.boost && (
                <span className="rounded border border-sky-200 bg-sky-50 px-1 py-px font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  희귀 지도 보정
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {entry.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommonMaterialDropsCard() {
  if (COMMON_HUNT_MATERIAL_DROPS.length === 0) return null;
  return (
    <Card padding="md">
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Package
              size={18}
              weight="duotone"
              className="text-amber-600 dark:text-amber-300"
              aria-hidden
            />
            전 지역 공통 재료
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            일반 사냥 승리마다 서로 독립적으로 판정되는 기본 확률입니다.
          </p>
        </div>
        <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          기본 확률 기준
        </span>
      </div>
      <MaterialDropGrid entries={COMMON_HUNT_MATERIAL_DROPS} />
    </Card>
  );
}

// 스타터 풀(깊이 1~6)이 떨어뜨릴 수 있는 정규 그리드 장비 id — 카탈로그 티어 가중 후
//   무작위 슬롯·컨셉으로 뽑히므로 해당 카탈로그 티어들의 그리드 전 종류가 후보.
//   유니크·제작전용·전문화스타터·밴드흔한(noDrop) 제외.
function starterGridIds(pool: FloorEquipDropPool): V2EquipmentId[] {
  const catalogTiers = new Set(
    Object.entries(pool.catalogTierWeights)
      .filter(([, w]) => (w ?? 0) > 0)
      .map(([t]) => Number(t)),
  );
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[]).filter((id) => {
    const it = V2_EQUIPMENT[id];
    return (
      catalogTiers.has(it.tier) &&
      !isUnique(it) &&
      !it.craftOnly &&
      !it.starterOnly &&
      !it.noDrop
    );
  });
}

export function codexThemeDeepDepth(depthStart: number): number {
  return Math.min(MAX_FRONTIER_DEPTH, Math.max(1, depthStart + 5));
}

export function classifyCodexEquipmentIds(ids: V2EquipmentId[]): {
  common: V2EquipmentId[];
  set: V2EquipmentId[];
} {
  const common: V2EquipmentId[] = [];
  const set: V2EquipmentId[] = [];
  for (const id of ids) {
    const item = V2_EQUIPMENT[id];
    // 상위 사냥터(43+)와 천공 균열 장비는 완성형 setId 대신
    // 단계 보너스를 가진 태그 세트(setTags)를 사용한다. 둘 다 세트 장비로 표시한다.
    if (item?.setId || (item?.setTags?.length ?? 0) > 0) set.push(id);
    else common.push(id);
  }
  return { common, set };
}

export function V2CodexView({ onBack }: { onBack: () => void }) {
  const tabParam = useSearchParams().get("tab");
  const { has: hasStoryFlag, set: setStoryFlag } = useStoryFlags();
  const refreshGameState = useRefreshGameState();
  const equipmentCodexContext = useEquipmentCodexContext();
  const registeredEquipmentIds =
    equipmentCodexContext?.loaded === true
      ? equipmentCodexContext.registeredIds
      : null;
  const { notifySystem } = useSystemToast();
  const [tutorialReplayRequested, setTutorialReplayRequested] = useState(false);
  const showTutorial = shouldShowCodexTutorial(
    hasStoryFlag(TUTORIAL_CODEX_INTRO),
    tutorialReplayRequested,
  );
  const dismissTutorial = () => {
    setStoryFlag(TUTORIAL_CODEX_INTRO);
    setTutorialReplayRequested(false);
  };
  const [tab, setTab] = useState<CodexTab>(() =>
    codexTabFromParam(tabParam),
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 제작 결과 등 외부 링크의 URL 탭 변경을 로컬 탭에 반영
    setTab(codexTabFromParam(tabParam));
  }, [tabParam]);
  const [masteryState, setMasteryState] = useState<
    { status: "idle" } | CodexMasteryPanelState
  >({ status: "idle" });
  const [masteryRetryVersion, setMasteryRetryVersion] = useState(0);
  const masteryViewMounted = useRef(true);
  useEffect(() => {
    masteryViewMounted.current = true;
    return () => {
      masteryViewMounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!shouldLoadCodexMastery(tab, masteryState.status)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 숙련 탭 최초 진입 또는 명시적 재시도에서 lazy fetch 상태 시작
    setMasteryState({ status: "loading" });
    fetch("/api/v2/me/codex-mastery")
      .then(async (response) => ({
        response,
        json: (await response.json().catch(() => null)) as
          | CodexMasteryOverviewResponse
          | null,
      }))
      .then(({ response, json }) => {
        if (!masteryViewMounted.current) return;
        if (!response.ok || !json?.ok) {
          setMasteryState({
            status: "error",
            message: json && !json.ok ? json.error : `http ${response.status}`,
          });
          return;
        }
        setMasteryState(
          json.enabled
            ? { status: "ready", snapshot: json.snapshot }
            : { status: "disabled" },
        );
      })
      .catch((error: unknown) => {
        if (masteryViewMounted.current) {
          setMasteryState({
            status: "error",
            message: error instanceof Error ? error.message : "network_error",
          });
        }
      });
    // masteryState.status intentionally stays outside the dependency list: changing idle to loading
    // must not cancel the request that caused that transition. Tab changes also keep the request alive;
    // only unmounting the entire codex view makes its response irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, masteryRetryVersion]);

  const retryCodexMastery = () => {
    setMasteryState({ status: "idle" });
    setMasteryRetryVersion((version) => version + 1);
  };
  const monthlyRanking = useCodexResearchRanking(
    tab === "mastery" &&
      masteryState.status === "ready" &&
      masteryState.snapshot.features.monthlyProgressEnabled,
  );

  const replaceCodexMasteryPins = async (
    pinnedGoals: CodexMasteryPinnedGoal[],
  ) => {
    const response = await fetch("/api/v2/me/codex-mastery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinnedGoals }),
    });
    const json = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      pinnedGoals?: CodexMasteryPinnedGoal[];
    } | null;
    if (!response.ok || !json?.ok || !Array.isArray(json.pinnedGoals)) {
      throw new Error(json?.error ?? `http ${response.status}`);
    }
    const savedPins = json.pinnedGoals;
    const savedKeys = new Set(
      savedPins.map((goal) => `${goal.category}:${goal.entryId}`),
    );
    setMasteryState((current) => {
      if (current.status !== "ready") return current;
      return {
        status: "ready",
        snapshot: {
          ...current.snapshot,
          pinnedGoals: savedPins,
          entries: current.snapshot.entries.map((entry) => ({
            ...entry,
            pinned: savedKeys.has(entry.key),
          })),
          nearGoals: current.snapshot.nearGoals.map((goal) => ({
            ...goal,
            pinned: savedKeys.has(goal.key),
          })),
        },
      };
    });
  };
  // 드랍 칩 클릭 시 뜨는 옵션 팝오버(읽기전용 카탈로그 미리보기 — 굴림 없음).
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  // 내 도감 진척 — /me/state 가 권위. 어보: 발견 id + 종별 최대어.
  const [fishDiscovered, setFishDiscovered] = useState<Set<string>>(new Set());
  const [fishCaught, setFishCaught] = useState<Set<string>>(new Set());
  const [fishBest, setFishBest] = useState<Record<string, number>>({});
  const [extractSelection, setExtractSelection] = useState<{
    fishId: FishId;
    projection: FishSpecimenExtractProjection;
  } | null>(null);
  const [extractBusy, setExtractBusy] = useState(false);
  const [cookingDiscoveredIds, setCookingDiscoveredIds] = useState<string[]>([]);
  const [fishingCodexMeta, setFishingCodexMeta] = useState<FishingCodexMeta>(
    () => defaultFishingCodexMeta(),
  );
  // 사냥터 도감 — 최고 도달 깊이(frontierDepth)까지 닿은 테마만 공개("처리했을 때 기준").
  const [frontierDepth, setFrontierDepth] = useState(0);
  const [combatPower, setCombatPower] = useState<number | null>(null);
  const [spFruitUsed, setSpFruitUsed] = useState<Record<SpFruitTier, number>>(
    () => parseSpFruitUsed(undefined),
  );
  const [spFruitCapBonus, setSpFruitCapBonus] = useState(0);
  const [spBreakdown, setSpBreakdown] =
    useState<V2LoadoutSpBreakdown | null>(null);
  const [jobUnlockProgress, setJobUnlockProgress] = useState({
    current: 0,
    total: 0,
  });
  const [equipmentCodexProgress, setEquipmentCodexProgress] = useState({
    current: 0,
    total: 0,
  });
  // 칭호 — 보유 목록(획득한 것만)·현재 장착. 장착은 /api/v2/me/equip-title POST.
  const [ownedTitleIds, setOwnedTitleIds] = useState<string[]>([]);
  const [equippedTitleId, setEquippedTitleId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchGameState()
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        // 어보 진척은 PR-2 에서 라우트가 채운다. 없으면 빈 상태(전종 미발견).
        let fishingDiscoveredCount = 0;
        const registeredIds = Array.isArray(j?.fishingCodex?.registeredIds)
          ? (j.fishingCodex.registeredIds as string[])
          : Array.isArray(j?.fishingCodex?.discoveredIds)
            ? (j.fishingCodex.discoveredIds as string[])
            : [];
        if (registeredIds.length > 0) {
          const ids = registeredIds;
          fishingDiscoveredCount = ids.length;
          setFishDiscovered(new Set(ids));
        } else {
          setFishDiscovered(new Set());
        }
        const fallbackFishingMeta =
          defaultFishingCodexMeta(fishingDiscoveredCount);
        const fishingMilestones = Array.isArray(j?.fishingCodex?.milestones)
          ? j.fishingCodex.milestones.filter(
              (n: unknown): n is number => typeof n === "number",
            )
          : fallbackFishingMeta.milestones;
        setFishingCodexMeta({
          total:
            typeof j?.fishingCodex?.total === "number"
              ? j.fishingCodex.total
              : fallbackFishingMeta.total,
          spBonus:
            typeof j?.fishingCodex?.spBonus === "number"
              ? j.fishingCodex.spBonus
              : fallbackFishingMeta.spBonus,
          milestones: fishingMilestones,
          nextMilestone:
            typeof j?.fishingCodex?.nextMilestone === "number" ||
            j?.fishingCodex?.nextMilestone === null
              ? j.fishingCodex.nextMilestone
              : fallbackFishingMeta.nextMilestone,
        });
        if (j?.fishingCodex?.best && typeof j.fishingCodex.best === "object") {
          const best = j.fishingCodex.best as Record<string, number>;
          setFishBest(best);
          setFishCaught(
            new Set(
              Array.isArray(j?.fishingCodex?.caughtIds)
                ? (j.fishingCodex.caughtIds as string[])
                : Object.keys(best),
            ),
          );
        } else {
          setFishBest({});
          setFishCaught(
            new Set(
              Array.isArray(j?.fishingCodex?.caughtIds)
                ? (j.fishingCodex.caughtIds as string[])
                : [],
            ),
          );
        }
        if (Array.isArray(j?.cookingCodex?.discoveredIds)) {
          setCookingDiscoveredIds(j.cookingCodex.discoveredIds as string[]);
        }
        if (typeof j?.frontierDepth === "number") {
          setFrontierDepth(j.frontierDepth);
        }
        if (typeof j?.combat?.power === "number") {
          setCombatPower(j.combat.power);
        }
        if (j?.spFruit?.used && typeof j.spFruit.used === "object") {
          setSpFruitUsed(parseSpFruitUsed(j.spFruit.used));
        }
        if (typeof j?.spFruit?.capBonus === "number") {
          setSpFruitCapBonus(j.spFruit.capBonus);
        }
        if (
          j?.loadout?.spBreakdown &&
          typeof j.loadout.spBreakdown === "object"
        ) {
          setSpBreakdown(j.loadout.spBreakdown as V2LoadoutSpBreakdown);
        }
        if (Array.isArray(j?.jobsV2?.jobs)) {
          const jobs = j.jobsV2.jobs as Array<{
            tier?: unknown;
            unlocked?: unknown;
          }>;
          setJobUnlockProgress(spEligibleJobProgress(jobs));
        }
        if (j?.equipmentCodex && typeof j.equipmentCodex === "object") {
          const codex = j.equipmentCodex as {
            registeredCount?: unknown;
            total?: unknown;
          };
          setEquipmentCodexProgress({
            current:
              typeof codex.registeredCount === "number"
                ? codex.registeredCount
                : 0,
            total: typeof codex.total === "number" ? codex.total : 0,
          });
        }
        if (Array.isArray(j?.titles?.ownedTitleIds)) {
          setOwnedTitleIds(j.titles.ownedTitleIds as string[]);
        }
        setEquippedTitleId(
          typeof j?.titles?.equippedTitleId === "string"
            ? j.titles.equippedTitleId
            : null,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 직업 도감 — 별도 엔드포인트라 "직업" 탭 최초 진입 시 1회만 lazy-load(이미 있으면 재요청 안 함).
  const [jobCodex, setJobCodex] = useState<JobCodex | null>(null);
  const [jobCodexLoading, setJobCodexLoading] = useState(false);
  useEffect(() => {
    if (tab !== "job" || jobCodex) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 직업 탭 최초 진입 시 도감 lazy fetch
    setJobCodexLoading(true);
    fetch("/api/v2/me/job-codex")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; codex?: JobCodex } | null) => {
        if (alive && j?.ok && j.codex) setJobCodex(j.codex);
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setJobCodexLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, jobCodex]);

  const previewFishExtraction = async (fishId: FishId) => {
    setExtractBusy(true);
    try {
      const response = await fetch("/api/v2/me/fishing-specimens/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fishId, preview: true }),
      });
      const json = (await response.json().catch(() => null)) as
        | FishSpecimenExtractResponse
        | null;
      const projection = projectionFromExtractResponse(json);
      if (
        projection &&
        [
          "confirmation_required",
          "sp_confirmation_required",
          "loadout_over_budget",
        ].includes(json?.error ?? "")
      ) {
        setExtractSelection({ fishId, projection });
        return;
      }
      notifySystem(
        `✗ ${
          json?.error === "not_registered"
            ? "이미 미등록 상태인 어종입니다"
            : (json?.error ?? `http ${response.status}`)
        }`,
      );
    } catch (error) {
      notifySystem(`✗ ${(error as Error).message}`);
    } finally {
      setExtractBusy(false);
    }
  };

  const confirmFishExtraction = async () => {
    if (!extractSelection || extractSelection.projection.overBudget) return;
    const { fishId, projection } = extractSelection;
    setExtractBusy(true);
    try {
      const response = await fetch("/api/v2/me/fishing-specimens/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fishId,
          confirmed: {
            fishSpBefore: projection.fishSpBefore,
            fishSpAfter: projection.fishSpAfter,
            totalSpBefore: projection.totalSpBefore,
            totalSpAfter: projection.totalSpAfter,
          },
        }),
      });
      const json = (await response.json().catch(() => null)) as
        | FishSpecimenExtractResponse
        | null;
      if (!response.ok || !json?.ok) {
        const latest = projectionFromExtractResponse(json);
        if (
          latest &&
          (json?.error === "stale_confirmation" ||
            json?.error === "loadout_over_budget")
        ) {
          setExtractSelection({ fishId, projection: latest });
          notifySystem(
            json.error === "stale_confirmation"
              ? "도감 SP 상태가 달라져 새 값으로 다시 확인해 주세요"
              : "장착 스킬을 새 SP 한도 안으로 조정해 주세요",
          );
          return;
        }
        notifySystem(`✗ ${json?.error ?? `http ${response.status}`}`);
        return;
      }

      const nextRegistered = new Set(fishDiscovered);
      nextRegistered.delete(fishId);
      setFishDiscovered(nextRegistered);
      setFishingCodexMeta((current) => ({
        ...current,
        spBonus:
          typeof json.fishSpAfter === "number"
            ? json.fishSpAfter
            : fishCodexSpBonusForCount(nextRegistered.size),
        nextMilestone: nextFishCodexMilestone(nextRegistered.size),
      }));
      setExtractSelection(null);
      await refreshGameState();
      notifySystem("✓ 표본 추출 완료 · 개인 어획 기록은 유지됩니다");
    } catch (error) {
      notifySystem(`✗ ${(error as Error).message}`);
    } finally {
      setExtractBusy(false);
    }
  };

  const spFruitUseCap = SP_FRUIT_TIERS.reduce(
    (sum, tier) => sum + SP_FRUIT[tier].useCap,
    0,
  );
  const spFruitUsedTotal = SP_FRUIT_TIERS.reduce(
    (sum, tier) => sum + (spFruitUsed[tier] ?? 0),
    0,
  );
  const spFishBonus =
    spBreakdown?.collectionBonus?.fishSp ?? fishingCodexMeta.spBonus;
  const spEquipmentBonus = spBreakdown?.equipmentCodexBonus ?? 0;
  const spJobUnlockBonus = spBreakdown?.jobUnlockSp ?? 0;
  const spSoftCapReduction = spBreakdown?.softCapReduction ?? 0;
  const spCurrentTotal =
    spBreakdown == null
      ? spFruitCapBonus + spFishBonus
      : spBreakdown.base +
        spJobUnlockBonus -
        spSoftCapReduction +
        spBreakdown.spFruitBonus +
        spFishBonus +
        spEquipmentBonus;
  const spSourceRows = [
    {
      label: "기본 SP",
      value: spBreakdown?.base ?? 0,
      detail: "캐릭터 기본 예산",
    },
    {
      label: "직업 해금",
      value: spJobUnlockBonus,
      detail: "직업 트리 해금 보너스",
      signed: true,
    },
    {
      label: "어보",
      value: spFishBonus,
      detail: "낚시 도감 보상",
      signed: true,
    },
    {
      label: "장비 도감",
      value: spEquipmentBonus,
      detail: "장비 등록 보상",
      signed: true,
    },
    {
      label: "SP 열매",
      value: spBreakdown?.spFruitBonus ?? spFruitCapBonus,
      detail: `사용 ${spFruitUsedTotal}/${spFruitUseCap}개`,
      signed: true,
    },
    ...(spSoftCapReduction > 0
      ? [
          {
            label: "상한 조정",
            value: -spSoftCapReduction,
            detail: "기본·직업 해금 합산 소프트캡",
          },
        ]
      : []),
  ];
  const spCollectionCards = spSourceRows.filter(
    (row) => row.label !== "SP 열매",
  ).map((row) => {
    const progress =
      row.label === "기본 SP"
        ? { current: 1, total: 1, label: "기본 지급 완료" }
        : row.label === "직업 해금"
          ? {
              current: jobUnlockProgress.current || spJobUnlockBonus,
              total: jobUnlockProgress.total || Math.max(spJobUnlockBonus, 1),
              label: `해금 ${jobUnlockProgress.current || spJobUnlockBonus}/${
                jobUnlockProgress.total || Math.max(spJobUnlockBonus, 1)
              }직업`,
            }
            : row.label === "어보"
              ? {
                  current: fishDiscovered.size,
                  total: fishingCodexMeta.total,
                  label: `수집 ${fishDiscovered.size}/${fishingCodexMeta.total}종`,
                }
              : row.label === "장비 도감"
                ? {
                    current: equipmentCodexProgress.current,
                    total:
                      equipmentCodexProgress.total ||
                      Math.max(equipmentCodexProgress.current, 1),
                    label: `등록 ${equipmentCodexProgress.current}/${
                      equipmentCodexProgress.total ||
                      Math.max(equipmentCodexProgress.current, 1)
                    }종`,
                  }
                : {
                    current: Math.abs(row.value),
                    total: Math.max(Math.abs(row.value), 1),
                    label: "상한 조정 적용",
                  };
    const progressPct =
      progress.total > 0
        ? Math.min(100, (progress.current / progress.total) * 100)
        : 0;
    const spRange = spCollectionSpRange({
      label: row.label,
      value: row.value,
      jobUnlockTotal:
        jobUnlockProgress.total || Math.max(spJobUnlockBonus, 1),
    });
    return { ...row, progress, progressPct, spRange };
  });
  // 도달한 깊이까지의 사냥터 테마(들판/마른 협곡/…) — 테마당 1개.
  const themes = dungeonThemeCatalog(frontierDepth);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title="모험의 서"
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={() => setTutorialReplayRequested(true)}
            aria-label="모험의 서 이용 안내 다시 보기"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Question size={16} weight="bold" aria-hidden />
            <span className="hidden sm:inline">안내</span>
          </button>
        }
      />
      <div className="flex flex-wrap gap-1.5">
        {CODEX_TAB_ITEMS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tab === key
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "huntground" &&
        (themes.length === 0 ? (
          <EmptyState
            icon={<Sword size={40} weight="duotone" />}
            title="아직 도달한 사냥터가 없습니다"
            message="사냥을 떠나 새로운 구역을 개척하면 여기에 몬스터와 드랍 정보가 기록됩니다."
          />
        ) : (
          <div className="space-y-3">
            <CommonMaterialDropsCard />
            {themes.map((theme) => {
              const deepDepth = codexThemeDeepDepth(theme.depthStart);
              const recommendedPower = floorPowerGate(deepDepth);
              const pool = dropPoolForDepth(theme.depthStart);
              const bandIds = commonIdsForDepthRange(
                theme.depthStart,
                deepDepth,
              );
              const skyRiftWeaponIds =
                theme.depthStart <= 78 && deepDepth >= 78
                  ? [...SKY_RIFT_WEAPON_IDS]
                  : [];
              const uniqueIds = uniqueIdsForDepthRange(
                theme.depthStart,
                deepDepth,
              );
              const materialDrops = regionalHuntMaterialDrops({
                areaName: theme.name,
                depthStart: theme.depthStart,
                depthEnd: deepDepth,
                monsterKeys: theme.enemies.map((enemy) => enemy.key),
              });
              // 일반 장비 드랍 목록 — 프론티어 밴드 풀(7~84) 또는 들판 스타터 그리드(1~6).
              const regularIds: V2EquipmentId[] = bandIds.length > 0
                ? [...bandIds, ...skyRiftWeaponIds]
                : pool
                  ? starterGridIds(pool)
                  : [];
              const classified = classifyCodexEquipmentIds(regularIds);
              const huntgroundCodexProgress = registeredEquipmentIds
                ? codexEquipmentProgress(
                    [...regularIds, ...uniqueIds],
                    registeredEquipmentIds,
                  )
                : null;
              const regularChance = bandIds.length > 0
                ? theme.depthStart >= 73
                  ? SKY_RIFT_CODEX_DROP_SUMMARY
                  : `처치당 ${(bandCommonChanceForDepth(deepDepth) * 100).toFixed(3)}% · 무작위 1종`
                : pool
                  ? `처치당 ${(equipPoolChance(pool) * 100).toFixed(0)}% · 무작위 1종`
                  : "";
              return (
                <Card key={theme.name} padding="md">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
                    <h2 className="text-sm font-bold">{theme.name}</h2>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      깊이 {theme.depthStart}~{deepDepth}
                    </span>
                  </div>

                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300">
                      최심부 · 깊이 {deepDepth}
                    </span>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {combatPower == null
                        ? `권장 전투력 ${recommendedPower.toLocaleString()} 기준`
                        : `내 전투력 ${combatPower.toLocaleString()} · 권장 ${recommendedPower.toLocaleString()}`}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {theme.enemies.map((e) => {
                      const base = V2_MONSTERS[e.key];
                      if (!base) return null;
                      const m = scaleMonsterForFloor(base, deepDepth, true);
                      const status = e.statusSkill
                        ? (V2_SKILLS[e.statusSkill as V2SkillId]?.name ?? null)
                        : null;
                      // 이미지 — 사냥(hunt)과 동일 우선순위(enemy override ?? 몬스터 카탈로그).
                      const img = e.image ?? base.image;
                      return (
                        <div
                          key={e.key}
                          className={`${SURFACE_INSET} flex items-center gap-2 px-2 py-1.5`}
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-200 text-zinc-400 dark:bg-zinc-800">
                              <Sword size={16} weight="duotone" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {e.name}
                              </span>
                              {status && (
                                <span className="rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                  {status}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              HP {m.hp} · 공 {m.atk} · 방 {m.def} · EXP {m.exp}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {materialDrops.length > 0 && (
                    <section className="mt-2.5 space-y-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                          <Package size={15} weight="duotone" aria-hidden />
                          지역 재료 드랍
                        </h3>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          지역 공통 · 몬스터 전용
                        </span>
                      </div>
                      <MaterialDropGrid entries={materialDrops} />
                    </section>
                  )}

                  {/* 드랍 — 일반·세트·유니크를 표시 속성으로 분리. 유니크 세트는 유니크 우선. */}
                  <div className="mt-2.5 space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                        <Sword size={15} weight="duotone" aria-hidden />
                        장비 드랍
                      </h3>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {huntgroundCodexProgress &&
                          huntgroundCodexProgress.totalCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                              {huntgroundCodexProgress.complete && (
                                <CheckCircle
                                  size={11}
                                  weight="fill"
                                  className="text-emerald-600 dark:text-emerald-300"
                                  aria-hidden
                                />
                              )}
                              {huntgroundCodexProgress.complete
                                ? "도감 완료"
                                : "도감 등록"}{" "}
                              {huntgroundCodexProgress.registeredCount}/
                              {huntgroundCodexProgress.totalCount}
                            </span>
                          )}
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          일반 · 세트 · 유니크
                        </span>
                      </div>
                    </div>
                    {regularIds.length > 0 && (
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        일반·세트 장비 {regularChance}
                      </p>
                    )}
                    {skyRiftWeaponIds.length > 0 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        78단계 무기 완제품 {(SKY_RIFT_WEAPON_DROP_CHANCE * 100).toFixed(2)}% · 길드 공방 확정 제작 가능
                      </p>
                    )}
                    <div>
                      <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        일반
                      </div>
                      {classified.common.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {classified.common.map((id) => (
                            <DropChip
                              key={id}
                              id={id}
                              kind="common"
                              registered={
                                registeredEquipmentIds
                                  ? registeredEquipmentIds.has(id)
                                  : undefined
                              }
                              onOpen={(item, anchor) =>
                                setCard({ item, anchor })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          없음
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        세트
                      </div>
                      {classified.set.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {classified.set.map((id) => (
                            <DropChip
                              key={id}
                              id={id}
                              kind="set"
                              registered={
                                registeredEquipmentIds
                                  ? registeredEquipmentIds.has(id)
                                  : undefined
                              }
                              onOpen={(item, anchor) =>
                                setCard({ item, anchor })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          없음
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 flex items-baseline gap-1.5">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          유니크
                        </span>
                        {uniqueIds.length > 0 && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {codexUniqueDropSummary(theme.depthStart)}
                          </span>
                        )}
                      </div>
                      {uniqueIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniqueIds.map((id) => (
                            <DropChip
                              key={id}
                              id={id}
                              kind="unique"
                              registered={
                                registeredEquipmentIds
                                  ? registeredEquipmentIds.has(id)
                                  : undefined
                              }
                              onOpen={(item, anchor) =>
                                setCard({ item, anchor })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          없음
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}


      {tab === "equipment" && <CodexEquipmentPanel onShowCard={setCard} />}

      {tab === "mastery" && (
        <CodexMasteryPanel
          state={masteryState.status === "idle" ? { status: "loading" } : masteryState}
          onRetry={retryCodexMastery}
          onReplacePinnedGoals={replaceCodexMasteryPins}
          monthlyRanking={monthlyRanking.state}
        />
      )}

      {tab === "spFruit" && (
        <div className={`${CODEX_PANEL_SURFACE} space-y-3`}>
          <Card padding="md">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">SP 수집 현황</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {spBreakdown ? "현재 SP 최대치" : "확인된 수집 보너스"}{" "}
                  {spCurrentTotal} · SP 열매 +{spFruitCapBonus}
                </p>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                영구 SP 기록
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {spSourceRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/70"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {row.label}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        row.value < 0
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {row.value > 0 && row.signed ? "+" : ""}
                      {row.value}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {row.detail}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="text-sm font-bold">SP 수집 목록</h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                열매 외 영구 SP
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {spCollectionCards.map((row) => {
                const complete =
                  row.progress.total > 0 &&
                  row.progress.current >= row.progress.total;
                const gained =
                  row.value > 0 || row.label === "기본 SP" || row.value < 0;
                return (
                  <Card key={row.label} padding="md">
                    <div className="flex min-h-[8.75rem] flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold">
                            {row.label}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {row.detail}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            complete
                              ? "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                              : gained
                                ? "bg-amber-200/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {complete ? "완료" : gained ? "진행" : "미획득"}
                        </span>
                      </div>
                      <div
                        className={`mt-3 text-2xl font-bold tabular-nums ${
                          row.value < 0
                            ? "text-rose-600 dark:text-rose-300"
                            : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {row.spRange.current}
                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                          /{row.spRange.maximum}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${
                            row.value < 0 ? "bg-rose-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${row.progressPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                        {row.progress.label}
                      </div>
                      <div className="mt-auto pt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.label === "상한 조정"
                          ? "SP 최대치 계산에서 차감"
                          : "현재 SP 최대치에 반영"}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="text-sm font-bold">SP 열매 상세</h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                협동 보스 · 폭풍 원정 보상
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SP_FRUIT_TIERS.map((tier) => {
                const def = SP_FRUIT[tier];
                const used = spFruitUsed[tier] ?? 0;
                const source = spFruitCodexSource(tier);
                const complete = used >= def.useCap;
                return (
                  <Card key={tier} padding="md">
                    <div className="flex min-h-[8.75rem] flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold">
                            {def.name}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {source}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            complete
                              ? "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                              : "bg-amber-200/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                          }`}
                        >
                          {complete ? "완료" : "진행"}
                        </span>
                      </div>

                      <div className="mt-3 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {used}
                        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                          /{def.useCap}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${Math.min(100, (used / def.useCap) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-auto pt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                        현재 SP +{used * def.spPerUse} · 1개당 SP +
                        {def.spPerUse}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "fish" && (
        <FishingCodexPanel
          registeredIds={fishDiscovered}
          caughtIds={fishCaught}
          best={fishBest}
          meta={fishingCodexMeta}
          extractBusy={extractBusy}
          onPreviewExtraction={(fishId) => void previewFishExtraction(fishId)}
        />
      )}
      {tab === "cooking" && (
        <CookingCodexPanel discoveredIds={cookingDiscoveredIds} />
      )}
      {tab === "life" && <LifeFieldCodexPanel />}
      {tab === "title" && (
        <CodexTitlePanel
          ownedTitleIds={ownedTitleIds}
          equippedTitleId={equippedTitleId}
          onEquippedTitleChange={setEquippedTitleId}
        />
      )}
      {tab === "job" &&
        (jobCodex ? (
          <JobCodexList codex={jobCodex} />
        ) : (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {jobCodexLoading
                ? "직업 도감을 불러오는 중…"
                : "직업 도감을 불러오지 못했어요."}
            </p>
          </Card>
        ))}

      {/* 드랍 칩 클릭 → 아이템 옵션 팝오버. 카탈로그 미리보기(굴림·장착 액션 없음). */}
      {card && (
        <V2ItemCard
          item={card.item}
          anchor={card.anchor}
          onClose={() => setCard(null)}
        />
      )}

      {extractSelection && (
        <FishSpecimenExtractModal
          fish={FISH[extractSelection.fishId]}
          projection={extractSelection.projection}
          busy={extractBusy}
          onConfirm={() => void confirmFishExtraction()}
          onClose={() => setExtractSelection(null)}
        />
      )}

      {showTutorial && (
        <TutorialOverlayInner
          title="모험의 서 이용 안내"
          body={
            <>
              <p>
                모험의 서는 플레이하며 발견한 정보와 영구 성장 기록을 한곳에
                모아보는 도감입니다.
              </p>
              <ol className="space-y-3">
                <li className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    1
                  </span>
                  <span>
                    <strong>플레이하면 기록이 열립니다.</strong> 사냥터를 개척하고,
                    직업을 해금하고, 물고기를 낚거나 요리를 처음 완성하면 해당
                    정보가 자동으로 추가됩니다.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    2
                  </span>
                  <span>
                    <strong>장비는 직접 등록해야 합니다.</strong> 장비 탭에서 보유
                    장비를 등록할 수 있으며, 등록한 장비 개체는 영구적으로
                    소모됩니다.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    3
                  </span>
                  <span>
                    <strong>수집은 성장으로 이어집니다.</strong> 장비 도감과 어보의
                    수집 단계는 SP 최대치에 반영되며, SP 수집 탭에서 전체 내역과
                    다음 목표를 확인할 수 있습니다.
                  </span>
                </li>
              </ol>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                이 안내는 오른쪽 위 물음표 버튼에서 언제든 다시 볼 수 있습니다.
              </p>
            </>
          }
          dismissLabel="모험의 서 살펴보기"
          onDismiss={dismissTutorial}
        />
      )}
    </main>
  );
}
