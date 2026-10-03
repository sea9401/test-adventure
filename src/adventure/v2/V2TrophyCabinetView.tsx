"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CaretDown,
  Check,
  Crown,
  Eye,
  EyeSlash,
  LockKey,
  SpinnerGap,
  Sword,
  Trophy,
} from "@phosphor-icons/react";
import type { AchievementBadgeTier } from "@/adventure/data/v2/v2Quests";
import type {
  ProfileShowcaseSelection,
  ProfileShowcaseSlots,
} from "@/adventure/profile/profileShowcase";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

export type TrophyOption = {
  id: string;
  kind?: "achievement" | "mastery" | "research";
  category?: "equipment" | "fish" | "monster" | "cooking" | "life" | "job" | "overall" | "research";
  title: string;
  desc: string;
  points: number;
  badgeTier: AchievementBadgeTier;
  unlocked: boolean;
  currentTier?: AchievementBadgeTier | null;
  nextTier?: AchievementBadgeTier | null;
  progress?: { current: number; required: number } | null;
  tierAchievedAt?: Partial<Record<AchievementBadgeTier, string>>;
};

type TrophyResponse = {
  ok?: boolean;
  standOwned?: boolean;
  visible?: boolean;
  slots?: ProfileShowcaseSlots;
  trophyOptions?: TrophyOption[];
};

type TrophyFilter = "all" | "unlocked" | "locked";
type TrophyKindFilter = "all" | "achievement" | "mastery" | "research";

const EMPTY_SLOTS: ProfileShowcaseSlots = [null, null, null];
const FILTERS: { id: TrophyFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "unlocked", label: "획득" },
  { id: "locked", label: "미획득" },
];
const CATEGORY_LABELS = {
  equipment: "장비",
  fish: "어보",
  monster: "몬스터·사냥터",
  cooking: "요리",
  life: "현장 기록",
  job: "직업",
  overall: "종합",
  research: "월간 연구",
} as const;

const TIER_STYLE: Record<
  AchievementBadgeTier,
  { ring: string; icon: string; label: string }
> = {
  bronze: {
    ring: "border-orange-700 bg-orange-100 dark:border-orange-500 dark:bg-orange-950",
    icon: "text-orange-700 dark:text-orange-300",
    label: "동",
  },
  silver: {
    ring: "border-zinc-500 bg-zinc-100 dark:border-zinc-400 dark:bg-zinc-900",
    icon: "text-zinc-600 dark:text-zinc-200",
    label: "은",
  },
  gold: {
    ring: "border-amber-600 bg-amber-100 dark:border-amber-500 dark:bg-amber-950",
    icon: "text-amber-700 dark:text-amber-300",
    label: "금",
  },
  platinum: {
    ring: "border-sky-500 bg-sky-50 dark:border-sky-300 dark:bg-sky-950",
    icon: "text-sky-700 dark:text-sky-200",
    label: "백금",
  },
  diamond: {
    ring: "border-teal-500 bg-teal-50 dark:border-teal-300 dark:bg-teal-950",
    icon: "text-teal-700 dark:text-teal-200",
    label: "다이아",
  },
  legendary: {
    ring: "border-violet-600 bg-violet-100 dark:border-violet-400 dark:bg-violet-950",
    icon: "text-violet-700 dark:text-violet-200",
    label: "전설",
  },
};

const KIND_FILTERS: ReadonlyArray<{ key: TrophyKindFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "achievement", label: "업적" },
  { key: "mastery", label: "도감 숙련" },
  { key: "research", label: "월간 연구" },
];

const TROPHY_KIND_LABEL = {
  achievement: "업적",
  mastery: "도감 숙련",
  research: "월간 연구",
} as const;

// 수집 목록 — 획득한 트로피는 큰 칸으로, 미획득은 종류별 접기 안 작은 행으로 보여 준다.
export function splitTrophiesForCabinet(trophies: readonly TrophyOption[]): {
  unlocked: TrophyOption[];
  lockedByKind: Array<{ kind: keyof typeof TROPHY_KIND_LABEL; items: TrophyOption[] }>;
} {
  return {
    unlocked: trophies.filter((trophy) => trophy.unlocked),
    lockedByKind: (["achievement", "mastery", "research"] as const)
      .map((kind) => ({
        kind,
        items: trophies.filter((trophy) => !trophy.unlocked && trophyKind(trophy) === kind),
      }))
      .filter((group) => group.items.length > 0),
  };
}

function trophyKind(
  trophy: Pick<TrophyOption, "kind">,
): "achievement" | "mastery" | "research" {
  return trophy.kind ?? "achievement";
}

function isCodexTrophy(trophy: Pick<TrophyOption, "kind">): boolean {
  return trophyKind(trophy) !== "achievement";
}

export function profileSelectionForTrophy(
  trophy: Pick<TrophyOption, "id" | "kind">,
): ProfileShowcaseSelection {
  return isCodexTrophy(trophy)
    ? { kind: "masteryTrophy", trophyId: trophy.id }
    : { kind: "achievement", achievementId: trophy.id };
}

function selectionMatchesTrophy(
  selection: ProfileShowcaseSelection | null,
  trophy: TrophyOption,
): boolean {
  return isCodexTrophy(trophy)
    ? selection?.kind === "masteryTrophy" && selection.trophyId === trophy.id
    : selection?.kind === "achievement" && selection.achievementId === trophy.id;
}

export function V2TrophyCabinetView({
  onBack,
  previewData,
}: {
  onBack?: () => void;
  previewData?: TrophyResponse;
}) {
  const [data, setData] = useState<TrophyResponse | null>(previewData ?? null);
  const [loading, setLoading] = useState(previewData == null);
  const [filter, setFilter] = useState<TrophyFilter>("all");
  const [kindFilter, setKindFilter] = useState<TrophyKindFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [targetSlot, setTargetSlot] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (previewData) return;
    let active = true;
    void fetch("/api/v2/me/profile-showcase")
      .then(async (response) =>
        response.ok ? ((await response.json()) as TrophyResponse) : null,
      )
      .then((next) => {
        if (active) setData(next?.ok ? next : { ok: false });
      })
      .catch(() => {
        if (active) setData({ ok: false });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [previewData]);

  const trophies = useMemo(
    () =>
      [...(data?.trophyOptions ?? [])].sort(
        (a, b) =>
          Number(b.unlocked) - Number(a.unlocked) ||
          b.points - a.points ||
          a.title.localeCompare(b.title, "ko"),
      ),
    [data?.trophyOptions],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const availableYears = useMemo(
    () =>
      Array.from(
        new Set(
          trophies.flatMap((trophy) =>
            Object.values(trophy.tierAchievedAt ?? {}).flatMap((achievedAt) => {
              const year = new Date(achievedAt).getFullYear();
              return Number.isFinite(year) ? [String(year)] : [];
            }),
          ),
        ),
      ).sort((a, b) => Number(b) - Number(a)),
    [trophies],
  );
  const filtered = trophies.filter((trophy) =>
    (filter === "all"
      ? true
      : filter === "unlocked"
        ? trophy.unlocked
        : !trophy.unlocked) &&
    (kindFilter === "all" || trophyKind(trophy) === kindFilter) &&
    (categoryFilter === "all" || trophy.category === categoryFilter) &&
    (tierFilter === "all" || trophy.badgeTier === tierFilter) &&
    (yearFilter === "all" ||
      Object.values(trophy.tierAchievedAt ?? {}).some(
        (achievedAt) => String(new Date(achievedAt).getFullYear()) === yearFilter,
      )) &&
    (normalizedQuery.length === 0 ||
      `${trophy.title} ${trophy.desc}`.toLocaleLowerCase("ko").includes(normalizedQuery)),
  );
  const split = splitTrophiesForCabinet(filtered);
  const activeFilterCount = [kindFilter, categoryFilter, tierFilter, yearFilter].filter(
    (value) => value !== "all",
  ).length;
  const slots = data?.slots ?? EMPTY_SLOTS;
  const selected = trophies.find((trophy) => trophy.id === selectedId) ?? null;
  const usedByOtherSlot =
    selected != null &&
    slots.some(
      (slot, index) =>
        index !== targetSlot &&
        selectionMatchesTrophy(slot, selected),
    );

  const save = async (updates: { slots?: ProfileShowcaseSlots; visible?: boolean }) => {
    if (saving) return false;
    setSaving(true);
    setMessage(null);
    try {
      if (previewData) {
        setData((current) => ({ ...current, ...updates, ok: true }));
        setMessage("미리보기에서 변경 사항을 반영했습니다.");
        return true;
      }
      const response = await fetch("/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const result = (await response.json().catch(() => null)) as TrophyResponse | null;
      if (!response.ok || !result?.ok) throw new Error("save failed");
      setData((current) => ({ ...current, ...result }));
      setMessage("대표 트로피를 저장했습니다.");
      return true;
    } catch {
      setMessage("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const putSelectedInSlot = async () => {
    if (!selected?.unlocked || usedByOtherSlot || !data?.standOwned) return;
    const nextSlots = [...slots] as ProfileShowcaseSlots;
    nextSlots[targetSlot] = profileSelectionForTrophy(selected);
    await save({ slots: nextSlots });
  };

  const clearTargetSlot = async () => {
    const nextSlots = [...slots] as ProfileShowcaseSlots;
    nextSlots[targetSlot] = null;
    await save({ slots: nextSlots });
  };

  return (
    <main className="mx-auto max-w-[860px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader title="트로피 전시대" onBack={onBack} />

      {loading ? (
        <Card padding="md">
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <SpinnerGap size={18} className="animate-spin" aria-hidden="true" />
            트로피를 불러오는 중…
          </div>
        </Card>
      ) : !data?.ok ? (
        <Card padding="md">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            트로피 정보를 불러오지 못했습니다.
          </p>
        </Card>
      ) : (
        <>
          <Card padding="md">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">대표 트로피 3종</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  캐릭터 정보에서 다른 모험가에게 보일 트로피를 선택합니다.
                </p>
              </div>
              {data.standOwned ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save({ visible: data.visible === false })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:border-amber-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {data.visible === false ? <Eye size={15} /> : <EyeSlash size={15} />}
                  {data.visible === false ? "공개하기" : "비공개로 전환"}
                </button>
              ) : null}
            </div>

            {!data.standOwned ? (
              <div className={`${SURFACE_INSET} mt-3 flex items-start gap-2 p-3`}>
                <LockKey size={18} weight="duotone" className="mt-0.5 shrink-0 text-zinc-500" />
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  트로피 수집 현황은 볼 수 있지만 대표 지정에는 상점의 대표 배지 전시대가 필요합니다.
                </p>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2" aria-label="대표 트로피 슬롯">
              {slots.map((slot, index) => {
                const trophy = trophies.find((item) =>
                  selectionMatchesTrophy(slot, item)
                ) ?? null;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={targetSlot === index}
                    onClick={() => setTargetSlot(index)}
                    className={`${SURFACE_INSET} relative flex min-h-24 flex-col items-center justify-center p-2 text-center transition-shadow ${
                      targetSlot === index
                        ? "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900"
                        : "hover:border-amber-300 dark:hover:border-amber-700"
                    }`}
                  >
                    <span className="absolute left-2 top-1.5 text-xs font-bold text-zinc-400">
                      {index + 1}
                    </span>
                    {trophy ? (
                      <>
                        <TrophyMedallion trophy={trophy} size="md" />
                        <span className="mt-1.5 line-clamp-1 text-xs font-bold">
                          {trophy.title}
                        </span>
                      </>
                    ) : slot ? (
                      <>
                        <span className="flex size-10 items-center justify-center rounded-full border border-violet-300 bg-violet-50 text-violet-600 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          {slot.kind === "equipment" ? <Sword size={21} /> : <Crown size={21} />}
                        </span>
                        <span className="mt-1.5 text-xs font-bold">기존 전시 항목</span>
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400">비어 있음</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex min-h-8 items-center justify-between gap-2">
              <p className={`text-xs ${message?.startsWith("저장하지") ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                {message ?? `${targetSlot + 1}번 칸을 편집 중입니다.`}
              </p>
              <Button
                variant="ghost"
                onClick={() => void clearTargetSlot()}
                disabled={saving || !data.standOwned || slots[targetSlot] == null}
              >
                대표 해제
              </Button>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold">수집한 트로피</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {trophies.filter((trophy) => trophy.unlocked).length} / {trophies.length} 획득
                </p>
              </div>
              <SegmentedControl
                options={FILTERS.map((item) => ({ key: item.id, label: item.label }))}
                value={filter}
                onChange={setFilter}
                ariaLabel="트로피 보기"
                className="w-full sm:w-auto"
              />
            </div>

            <label className="mt-3 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              트로피 검색
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름이나 조건 검색"
                className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <details className={`${SURFACE_INSET} group mt-3 p-3`}>
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                필터{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                <CaretDown size={16} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    업적 · 도감 숙련 · 월간 연구
                  </span>
                  <SegmentedControl
                    options={KIND_FILTERS}
                    value={kindFilter}
                    onChange={setKindFilter}
                    ariaLabel="트로피 종류"
                    className="mt-1"
                  />
                </div>
                <select
                  aria-label="분야 선택"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="all">모든 분야</option>
                  {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <select
                  aria-label="등급 선택"
                  value={tierFilter}
                  onChange={(event) => setTierFilter(event.target.value)}
                  className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="all">모든 등급</option>
                  {Object.entries(TIER_STYLE).map(([id, style]) => (
                    <option key={id} value={id}>{style.label}</option>
                  ))}
                </select>
                <select
                  aria-label="연도 선택"
                  value={yearFilter}
                  onChange={(event) => setYearFilter(event.target.value)}
                  className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                >
                  <option value="all">모든 획득 연도</option>
                  {availableYears.map((year) => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
              </div>
            </details>

            {filter !== "locked" ? (
              split.unlocked.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {split.unlocked.map((trophy) => {
                    const selectedNow = selected?.id === trophy.id;
                    const represented = slots.some((slot) => selectionMatchesTrophy(slot, trophy));
                    return (
                      <button
                        key={trophy.id}
                        type="button"
                        aria-pressed={selectedNow}
                        onClick={() => setSelectedId(trophy.id)}
                        className={`${SURFACE_INSET} relative flex min-h-32 flex-col items-center justify-center p-3 text-center transition-shadow ${
                          selectedNow
                            ? "ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900"
                            : "hover:border-amber-300 dark:hover:border-amber-700"
                        }`}
                      >
                        {represented ? (
                          <span className="absolute right-2 top-2 rounded-full bg-amber-500 p-0.5 text-white" title="대표 전시 중">
                            <Check size={11} weight="bold" />
                          </span>
                        ) : null}
                        <TrophyMedallion trophy={trophy} size="lg" />
                        <span className="mt-2 line-clamp-2 min-h-8 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {trophy.title}
                        </span>
                        <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {isCodexTrophy(trophy)
                            ? `${TIER_STYLE[trophy.badgeTier].label} 획득`
                            : `${trophy.points}점`}
                        </span>
                        {trophyKind(trophy) === "research" ? (
                          <span className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {trophy.desc}
                          </span>
                        ) : null}
                        {trophyKind(trophy) === "mastery" && trophy.progress ? (
                          <span className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            {trophy.progress.current} / {trophy.progress.required}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                  {filtered.length === 0 ? "조건에 맞는 트로피가 없습니다." : "아직 획득한 트로피가 없습니다."}
                </p>
              )
            ) : null}

            {filter !== "unlocked" && split.lockedByKind.length > 0 ? (
              <div className="mt-4 space-y-2">
                {split.lockedByKind.map((group) => (
                  <details
                    key={`${group.kind}-${filter}`}
                    open={filter === "locked" || undefined}
                    className={`${SURFACE_INSET} group overflow-hidden`}
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                      미획득 {TROPHY_KIND_LABEL[group.kind]} {group.items.length}개
                      <CaretDown size={16} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
                      {group.items.map((trophy) => (
                        <li key={trophy.id}>
                          <button
                            type="button"
                            aria-pressed={selected?.id === trophy.id}
                            onClick={() => setSelectedId(trophy.id)}
                            className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                              selected?.id === trophy.id ? "bg-amber-50 dark:bg-zinc-800" : ""
                            }`}
                          >
                            <TrophyMedallion trophy={trophy} locked size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                                {trophy.title}
                              </span>
                              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {trophy.desc}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                              {trophy.progress
                                ? `${trophy.progress.current} / ${trophy.progress.required}`
                                : isCodexTrophy(trophy)
                                  ? `${TIER_STYLE[trophy.badgeTier].label} 목표`
                                  : `${trophy.points}점`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            ) : null}

            {selected ? (
              <div className={`${SURFACE_CARD} mt-4 border p-4`}>
                <div className="flex items-start gap-3">
                  <TrophyMedallion trophy={selected} locked={!selected.unlocked} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{selected.title}</h3>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {TIER_STYLE[selected.badgeTier].label} · {trophyKind(selected) === "research" ? "월간 연구" : trophyKind(selected) === "mastery" ? "도감 숙련" : `${selected.points}점`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {selected.desc}
                    </p>
                    {isCodexTrophy(selected) && selected.tierAchievedAt ? (
                      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="승급 연혁">
                        {Object.entries(selected.tierAchievedAt).map(([tier, achievedAt]) => (
                          <span
                            key={tier}
                            className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          >
                            {TIER_STYLE[tier as AchievementBadgeTier].label} · {new Date(achievedAt).toLocaleDateString("ko-KR")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="primary"
                    disabled={
                      saving ||
                      !data.standOwned ||
                      !selected.unlocked ||
                      usedByOtherSlot
                    }
                    onClick={() => void putSelectedInSlot()}
                  >
                    {saving
                      ? "저장 중…"
                      : usedByOtherSlot
                        ? "다른 칸에 전시 중"
                        : selected.unlocked
                          ? `${targetSlot + 1}번 칸에 전시`
                          : "획득 후 전시 가능"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </main>
  );
}

function TrophyMedallion({
  trophy,
  locked = false,
  size,
}: {
  trophy: TrophyOption;
  locked?: boolean;
  size: "sm" | "md" | "lg";
}) {
  const tone = TIER_STYLE[trophy.badgeTier];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-[3px] ${
        size === "lg" ? "size-14" : size === "md" ? "size-11" : "size-9 border-2"
      } ${locked ? "border-zinc-400 bg-zinc-100 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-500" : `${tone.ring} ${tone.icon} ${trophy.badgeTier === "legendary" ? "motion-safe:animate-pulse" : ""}`}`}
      title={`${trophy.title} · ${tone.label}`}
    >
      {locked ? (
        <LockKey size={size === "lg" ? 24 : size === "md" ? 19 : 16} weight="duotone" />
      ) : (
        <Trophy size={size === "lg" ? 27 : size === "md" ? 21 : 18} weight="duotone" />
      )}
    </span>
  );
}
