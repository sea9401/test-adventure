"use client";

import { useState, type ReactNode } from "react";
import {
  CaretDown,
  CaretRight,
  ClipboardText,
  Coins,
  Scroll,
  Star,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelative } from "@/lib/notifications";
import { QUESTS, questTargetTotal, type Quest } from "@/adventure/data/quests";
import { NPCS } from "@/adventure/data/npcs";
import { WORLD_MAP } from "@/adventure/data/world";
import { MATERIALS } from "@/adventure/data/materials";
import { ITEMS } from "@/adventure/data/items";
import type { QuestProgressEntry } from "./storage";

const REGION_NAMES = new Map(WORLD_MAP.regions.map((r) => [r.id, r.name]));
const REGION_LEVELS = new Map(
  WORLD_MAP.regions.map((r) => [r.id, r.recommendedLevel]),
);
const NPC_NAMES = new Map(NPCS.map((n) => [n.id, n.name]));

type Tab = "active" | "completed";

type QuestRow = { quest: Quest; entry: QuestProgressEntry };
type RegionGroup = {
  regionId: string;
  regionName: string;
  level: number | undefined;
  quests: QuestRow[];
  /** 길드 반복 의뢰의 ready — 수첩에서 바로 완료 가능. 완료 탭에선 0. */
  actionableReadyCount: number;
  /** NPC 의뢰의 ready — 해당 NPC 와 대화로 보상 수령. 완료 탭에선 0. */
  pendingReadyCount: number;
  /** 완료 탭 — 그룹 내 가장 최근 완료 시각(없으면 0). 진행 중 탭에선 0. */
  mostRecentAt: number;
};

// 길드 게시판에서 받은 반복 의뢰 — giverNpcId 없는 repeatable. 수첩에서 바로 완료 허용.
function isGuildBoardQuest(quest: Quest): boolean {
  return quest.repeatable && !quest.giverNpcId;
}

export function QuestJournalView({
  getEntry,
  onClaim,
}: {
  getEntry: (id: string) => QuestProgressEntry;
  onClaim?: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("active");

  // 진행 중 — 지역별로 묶고 지역은 적정레벨 오름차순. 같은 지역 안에서는 보상 대기를 위로.
  const activeGroups = buildActiveGroups(getEntry);
  const activeCount = activeGroups.reduce((a, g) => a + g.quests.length, 0);

  // 완료 — 지역별로 묶고 지역은 적정레벨 오름차순. 같은 지역 안에서는 최근 완료 순.
  const completedGroups = buildCompletedGroups(getEntry);
  const completedCount = completedGroups.reduce(
    (a, g) => a + g.quests.length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
        <TabButton
          label={`진행 중 ${activeCount}`}
          active={tab === "active"}
          onClick={() => setTab("active")}
        />
        <TabButton
          label={`완료 ${completedCount}`}
          active={tab === "completed"}
          onClick={() => setTab("completed")}
        />
      </div>

      {tab === "active" ? (
        activeGroups.length === 0 ? (
          <EmptyState
            icon={<ClipboardText size={40} weight="duotone" />}
            title="진행 중인 의뢰가 없습니다"
            message="길드 게시판이나 마을 사람들에게서 새 의뢰를 받아 보세요."
          />
        ) : (
          <div className="space-y-2">
            {activeGroups.map((g) => (
              <RegionSection
                key={g.regionId}
                group={g}
                tab="active"
                defaultOpen={false}
                onClaim={onClaim}
              />
            ))}
          </div>
        )
      ) : completedGroups.length === 0 ? (
        <EmptyState
          icon={<ClipboardText size={40} weight="duotone" />}
          title="아직 완료한 의뢰가 없습니다"
          message="의뢰를 완료하면 여기에 기록됩니다."
        />
      ) : (
        <div className="space-y-2">
          {completedGroups.map((g) => (
            <RegionSection
              key={g.regionId}
              group={g}
              tab="completed"
              defaultOpen={false}
              onClaim={onClaim}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 진행 중/보상 대기 의뢰들을 지역별로 묶어 정렬한다.
// - 지역 정렬: recommendedLevel 오름차순 (미지정은 맨 뒤, 동률은 stable)
// - 지역 내 정렬: 길드 ready(완료 가능) → NPC ready(보상 대기) → active 순,
//   같은 상태 내에서는 QUESTS 선언 순 유지
function buildActiveGroups(
  getEntry: (id: string) => QuestProgressEntry,
): RegionGroup[] {
  const map = new Map<string, RegionGroup>();
  for (const quest of QUESTS) {
    const entry = getEntry(quest.id);
    if (entry.state !== "active" && entry.state !== "ready") continue;
    let g = map.get(quest.regionId);
    if (!g) {
      g = {
        regionId: quest.regionId,
        regionName: REGION_NAMES.get(quest.regionId) ?? quest.regionId,
        level: REGION_LEVELS.get(quest.regionId),
        quests: [],
        actionableReadyCount: 0,
        pendingReadyCount: 0,
        mostRecentAt: 0,
      };
      map.set(quest.regionId, g);
    }
    g.quests.push({ quest, entry });
    if (entry.state === "ready") {
      if (isGuildBoardQuest(quest)) g.actionableReadyCount += 1;
      else g.pendingReadyCount += 1;
    }
  }
  const groups = Array.from(map.values()).sort(
    (a, b) =>
      (a.level ?? Number.POSITIVE_INFINITY) -
      (b.level ?? Number.POSITIVE_INFINITY),
  );
  for (const g of groups) {
    g.quests.sort((a, b) => rowRank(a) - rowRank(b));
  }
  return groups;
}

// 같은 지역 내 정렬용 순위. 0=길드 ready, 1=NPC ready, 2=active.
function rowRank(r: QuestRow): number {
  if (r.entry.state !== "ready") return 2;
  return isGuildBoardQuest(r.quest) ? 0 : 1;
}

// 완료한 의뢰들을 지역별로 묶어 정렬한다.
// - 지역 정렬: recommendedLevel 오름차순 (진행 중 탭과 통일)
// - 지역 내 정렬: lastCompletedAt 내림차순 (최근 완료가 위)
// - 그룹별 mostRecentAt 도 함께 계산해 헤더 부제로 "마지막 완료 N일 전" 표시
function buildCompletedGroups(
  getEntry: (id: string) => QuestProgressEntry,
): RegionGroup[] {
  const map = new Map<string, RegionGroup>();
  for (const quest of QUESTS) {
    const entry = getEntry(quest.id);
    if (entry.state !== "completed" && entry.completedCount === 0) continue;
    let g = map.get(quest.regionId);
    if (!g) {
      g = {
        regionId: quest.regionId,
        regionName: REGION_NAMES.get(quest.regionId) ?? quest.regionId,
        level: REGION_LEVELS.get(quest.regionId),
        quests: [],
        actionableReadyCount: 0,
        pendingReadyCount: 0,
        mostRecentAt: 0,
      };
      map.set(quest.regionId, g);
    }
    g.quests.push({ quest, entry });
    if ((entry.lastCompletedAt ?? 0) > g.mostRecentAt) {
      g.mostRecentAt = entry.lastCompletedAt ?? 0;
    }
  }
  const groups = Array.from(map.values()).sort(
    (a, b) =>
      (a.level ?? Number.POSITIVE_INFINITY) -
      (b.level ?? Number.POSITIVE_INFINITY),
  );
  for (const g of groups) {
    g.quests.sort(
      (a, b) =>
        (b.entry.lastCompletedAt ?? 0) - (a.entry.lastCompletedAt ?? 0),
    );
  }
  return groups;
}

function RegionSection({
  group,
  tab,
  defaultOpen,
  onClaim,
}: {
  group: RegionGroup;
  tab: Tab;
  defaultOpen: boolean;
  onClaim?: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-left hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/60"
      >
        <span className="flex items-baseline gap-2">
          {open ? (
            <CaretDown size={14} className="self-center text-zinc-400" />
          ) : (
            <CaretRight size={14} className="self-center text-zinc-400" />
          )}
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {group.regionName}
          </span>
          {group.level !== undefined && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              적정 Lv.{group.level}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs">
          {group.actionableReadyCount > 0 && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
              완료 가능 {group.actionableReadyCount}
            </span>
          )}
          {group.pendingReadyCount > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
              보상 대기 {group.pendingReadyCount}
            </span>
          )}
          {tab === "completed" && group.mostRecentAt > 0 && (
            <span className="text-zinc-400 dark:text-zinc-500">
              마지막 {formatRelative(group.mostRecentAt)}
            </span>
          )}
          <span className="text-zinc-500 dark:text-zinc-400">
            {group.quests.length}건
          </span>
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {group.quests.map(({ quest, entry }) => (
            <JournalCard
              key={quest.id}
              quest={quest}
              entry={entry}
              tab={tab}
              showRegion={false}
              onClaim={onClaim}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex-1 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
          : "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      }
    >
      {label}
    </button>
  );
}

function JournalCard({
  quest,
  entry,
  tab,
  showRegion,
  onClaim,
}: {
  quest: Quest;
  entry: QuestProgressEntry;
  tab: Tab;
  showRegion: boolean;
  onClaim?: (id: string) => void;
}) {
  const regionName = REGION_NAMES.get(quest.regionId) ?? quest.regionId;
  const giverName = quest.giverNpcId
    ? (NPC_NAMES.get(quest.giverNpcId) ?? null)
    : null;

  // 지역 그룹 헤더 안에서는 지역명을 카드 메타에서 생략(중복 회피).
  const meta: string[] = [];
  if (showRegion) meta.push(regionName);
  if (giverName) meta.push(`의뢰인 ${giverName}`);

  const isReady = tab === "active" && entry.state === "ready";
  const canClaimHere = isReady && isGuildBoardQuest(quest) && !!onClaim;

  return (
    <Card as="li" padding="md">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scroll size={18} weight="duotone" className="text-yellow-700" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {quest.title}
          </h3>
        </div>
        {isReady && canClaimHere && (
          <button
            type="button"
            onClick={() => onClaim?.(quest.id)}
            className="shrink-0 rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:border-emerald-400 dark:text-emerald-300"
          >
            완료 가능
          </button>
        )}
        {isReady && !canClaimHere && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            보상 대기
          </span>
        )}
      </div>

      {meta.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {meta.map((m, i) => (
            <span key={m} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden>·</span>}
              <span>{m}</span>
            </span>
          ))}
        </div>
      )}

      {tab === "active" && (
        <>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {quest.description}
          </p>

          <TargetView quest={quest} entry={entry} giverName={giverName} />

          <RewardLine quest={quest} />
        </>
      )}

      {tab === "completed" && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          {entry.completedCount > 0 && (
            <span>완료 {entry.completedCount}회</span>
          )}
          {entry.lastCompletedAt && (
            <span className="text-zinc-400 dark:text-zinc-500">
              마지막 완료 {formatRelative(entry.lastCompletedAt)}
            </span>
          )}
          {quest.repeatable && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
              반복
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// 의뢰 타겟 한 종류에 맞춰 진행 안내를 그린다. 누적형(kill/craft/talk N 회 등) 은 진행 바,
// 일회형/deliver/equip 은 한 줄 힌트. 타겟 종류가 늘어나면 여기서 분기 추가.
function TargetView({
  quest,
  entry,
  giverName,
}: {
  quest: Quest;
  entry: QuestProgressEntry;
  giverName: string | null;
}) {
  const t = quest.target;
  const total = questTargetTotal(t);
  switch (t.kind) {
    case "kill":
      return <ProgressBar label={`${t.monsterName} 처치`} progress={entry.progress} count={total} />;
    case "kill_within_hp":
      return (
        <ProgressBar
          label={`${t.monsterName} 처치 (HP ${Math.round(t.minHpFraction * 100)}% 이상 유지)`}
          progress={entry.progress}
          count={total}
        />
      );
    case "no_potion_boss":
      return (
        <ProgressBar
          label={`${t.monsterName} 처치 (포션 없이)`}
          progress={entry.progress}
          count={total}
        />
      );
    case "deliver":
      return (
        <Hint>
          {MATERIALS[t.materialId].name} {total}개를 모아 {giverName ?? "의뢰인"}에게 전달
        </Hint>
      );
    case "talk_to_npc": {
      const name = NPC_NAMES.get(t.npcId) ?? t.npcId;
      return total > 1 ? (
        <ProgressBar label={`${name} 와(과) 대화`} progress={entry.progress} count={total} />
      ) : (
        <Hint>{name} 와(과) 대화</Hint>
      );
    }
    case "visit_region": {
      const name = REGION_NAMES.get(t.regionId) ?? t.regionId;
      return total > 1 ? (
        <ProgressBar label={`${name} 방문`} progress={entry.progress} count={total} />
      ) : (
        <Hint>{name} 에 들른다</Hint>
      );
    }
    case "craft_item":
      return (
        <ProgressBar
          label={`${ITEMS[t.itemId].name} 제작`}
          progress={entry.progress}
          count={total}
        />
      );
    case "equip_item":
      return <Hint>{ITEMS[t.itemId].name} 을(를) 한 번이라도 장착</Hint>;
    case "equip_set": {
      const names = t.itemIds.map((id) => ITEMS[id].name).join(" · ");
      return (
        <ProgressBar
          label={`한 복 장착 — ${names}`}
          progress={entry.progress}
          count={total}
        />
      );
    }
  }
}

function ProgressBar({
  label,
  progress,
  count,
}: {
  label: string;
  progress: number;
  count: number;
}) {
  const shown = Math.min(progress, count);
  const pct = count > 0 ? Math.min(1, progress / count) : 0;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">
          {shown}/{count}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{children}
    </div>
  );
}

function RewardLine({ quest }: { quest: Quest }) {
  const chips: ReactNode[] = [];
  const r = quest.reward;
  if ((r.gold ?? 0) > 0) {
    chips.push(
      <span key="gold" className="inline-flex items-center gap-1">
        <Coins size={14} weight="fill" className="text-yellow-500" />
        <span className="tabular-nums">{r.gold}</span>
      </span>,
    );
  }
  if ((r.fame ?? 0) > 0) {
    chips.push(
      <span key="fame" className="inline-flex items-center gap-1">
        <Star size={14} weight="fill" className="text-amber-500" />
        <span className="tabular-nums">명성 {r.fame}</span>
      </span>,
    );
  }
  if ((r.exp ?? 0) > 0) {
    chips.push(
      <span key="exp" className="tabular-nums text-zinc-600 dark:text-zinc-300">
        EXP {r.exp}
      </span>,
    );
  }
  const extras: string[] = [];
  if (r.items?.length) extras.push(`아이템 ${r.items.length}종`);
  if (r.recipes?.length) extras.push(`제작서 ${r.recipes.length}장`);
  if (r.potions?.length) extras.push(`포션 ${r.potions.length}종`);
  if (r.materials?.length) extras.push(`재료 ${r.materials.length}종`);
  if ((r.potionCapacityBonus ?? 0) > 0)
    extras.push(`포션 슬롯 +${r.potionCapacityBonus}`);
  for (const e of extras) {
    chips.push(
      <span key={e} className="text-zinc-600 dark:text-zinc-300">
        {e}
      </span>,
    );
  }

  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700 dark:text-zinc-200">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">보상</span>
      {chips}
    </div>
  );
}
