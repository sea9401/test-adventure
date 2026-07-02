import { useCallback, useEffect, useMemo, useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_IDS,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import { V2_SLOT_LABEL } from "@/adventure/data/v2/v2Equipment";
import { useRewardToast } from "@/adventure/v2/RewardToastProvider";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  EnhanceLevelBadge,
  MasterworkBadge,
} from "../V2ItemCard";
import {
  DISMANTLE_ERROR_TEXT,
  dismantleBlockedText,
  dismantleRewardTotal,
  matchesDismantleScopeFilter,
  matchesDismantleTierFilter,
  workshopMaterialRewardText,
  type DismantleCandidateView,
  type DismantleResultView,
  type DismantleScopeFilter,
  type DismantleSortMode,
  type DismantleState,
  type DismantleTierFilter,
} from "./guildWorkshopPanelModel";

// 장비 해체 패널 — GuildWorkshopPanel 의 dismantle 모드 클러스터(상태 8종 + 로드 +
// 해체 mutation + 카드 JSX)를 분리(2026-07, #1196~1200 패널 분해 패턴의 연장).
// 해체 성공 응답의 재료/숙련도는 부모 워크숍 상태에도 반영해야 하므로 onWorkshopSync 로 위임.
// 모드 재진입 시 이 컴포넌트가 리마운트되어 목록을 새로 불러온다(기존: 부모 상태에 남은
// 직전 목록이 잠깐 보였다가 갱신 — 이제는 로딩 표시. 로드 시점 자체는 동일).
export function WorkshopDismantlePanel({
  materials,
  onWorkshopSync,
}: {
  /** 부모 워크숍 상태의 보유 재료 — 해체 응답 도착 전 표시 폴백. */
  materials: Record<string, number>;
  /** 해체 성공 시 부모 워크숍 상태(materials/artisan) 동기화. */
  onWorkshopSync: (sync: {
    materials?: Record<string, number>;
    artisan?: unknown;
  }) => void;
}) {
  const { notifyReward } = useRewardToast();
  const [dismantle, setDismantle] = useState<DismantleState | null>(null);
  const [dismantleLoading, setDismantleLoading] = useState(false);
  const [dismantleBusyIid, setDismantleBusyIid] = useState<string | null>(null);
  const [dismantleMessage, setDismantleMessage] = useState<string | null>(null);
  const [dismantleResult, setDismantleResult] =
    useState<DismantleResultView | null>(null);
  const [dismantleScopeFilter, setDismantleScopeFilter] =
    useState<DismantleScopeFilter>("all");
  const [dismantleTierFilter, setDismantleTierFilter] =
    useState<DismantleTierFilter>("all");
  const [dismantleSort, setDismantleSort] = useState<DismantleSortMode>("tier");

  const loadDismantle = useCallback(async () => {
    setDismantleLoading(true);
    try {
      const res = await fetch("/api/v2/guild/workshop/dismantle");
      const json = await res.json();
      if (json.ok && Array.isArray(json.candidates)) {
        setDismantle({
          materials: json.materials ?? {},
          requiredBlacksmithLevel: Math.max(
            1,
            Math.floor(Number(json.requiredBlacksmithLevel ?? 6)),
          ),
          candidates: json.candidates,
        });
      } else {
        setDismantleMessage(
          DISMANTLE_ERROR_TEXT[json.error ?? ""] ??
            "해체 정보를 불러오지 못했습니다.",
        );
      }
    } catch {
      setDismantleMessage("해체 정보를 불러오지 못했습니다.");
    } finally {
      setDismantleLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadDismantle());
  }, [loadDismantle]);

  const filteredDismantleCandidates = useMemo(() => {
    const candidates = [...(dismantle?.candidates ?? [])].filter(
      (item) =>
        matchesDismantleScopeFilter(item, dismantleScopeFilter) &&
        matchesDismantleTierFilter(item, dismantleTierFilter),
    );
    candidates.sort((a, b) => {
      if (dismantleSort === "reward") {
        return (
          dismantleRewardTotal(b) - dismantleRewardTotal(a) ||
          b.tier - a.tier ||
          a.itemName.localeCompare(b.itemName, "ko")
        );
      }
      if (dismantleSort === "name") {
        return a.itemName.localeCompare(b.itemName, "ko") || b.tier - a.tier;
      }
      return (
        b.tier - a.tier ||
        dismantleRewardTotal(b) - dismantleRewardTotal(a) ||
        a.itemName.localeCompare(b.itemName, "ko")
      );
    });
    return candidates;
  }, [
    dismantle?.candidates,
    dismantleScopeFilter,
    dismantleSort,
    dismantleTierFilter,
  ]);

  async function dismantleEquipment(iid: string) {
    setDismantleBusyIid(iid);
    setDismantleMessage(null);
    setDismantleResult(null);
    try {
      const res = await fetch("/api/v2/guild/workshop/dismantle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iid }),
      });
      const json = await res.json();
      if (!json.ok) {
        setDismantleMessage(
          DISMANTLE_ERROR_TEXT[json.error ?? ""] ?? "해체에 실패했습니다.",
        );
        return;
      }
      const dismantled = json.dismantled as DismantleCandidateView | undefined;
      if (dismantled) setDismantleResult(dismantled);
      const text = dismantled
        ? `${dismantled.itemName} · 숙련도 +${Number(
            dismantled.artisanXp ?? 0,
          ).toLocaleString()}`
        : "";
      setDismantleMessage(dismantled ? `해체 완료 · ${text}` : "해체 완료");
      notifyReward("해체 완료", text);
      onWorkshopSync({ materials: json.materials, artisan: json.artisan });
      setDismantle((prev) =>
        prev
          ? {
              ...prev,
              materials: json.materials ?? prev.materials,
              candidates: prev.candidates.filter((item) => item.iid !== iid),
            }
          : prev,
      );
      void loadDismantle();
    } catch {
      setDismantleMessage("해체에 실패했습니다.");
    } finally {
      setDismantleBusyIid(null);
    }
  }

  return (
    <div className="ui-workshop-card ui-smithy-card rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            장비 해체
          </h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            대장장이 Lv {dismantle?.requiredBlacksmithLevel ?? 6}부터 T4 이상
            대장장이 제작품을 제작 재료로 회수합니다.
          </div>
        </div>
        {dismantleLoading ? (
          <SpinnerGap
            size={16}
            className="shrink-0 animate-spin text-zinc-400"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mb-2 grid gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:grid-cols-2">
        <div>
          <span className="font-semibold">해체 가능</span> · 대장장이 제작자
          각인이 있는 장비, 제작 전용 장비
        </div>
        <div>
          <span className="font-semibold">해체 불가</span> · 필드/상점 장비,
          장착 중인 장비, 잠금 장비, T4 미만 장비
        </div>
      </div>
      <div className="mb-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        보유 제작 재료 ·{" "}
        {GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
          const mat = GUILD_WORKSHOP_MATERIALS[id];
          const amount = Math.max(
            0,
            Math.floor(Number(dismantle?.materials[id] ?? materials[id] ?? 0)),
          );
          return `${mat.name} ${amount.toLocaleString()}`;
        }).join(" · ")}
      </div>
      <div className="mb-2 grid gap-1.5 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-3">
        <select
          value={dismantleScopeFilter}
          onChange={(e) =>
            setDismantleScopeFilter(e.target.value as DismantleScopeFilter)
          }
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="can">해체 가능만</option>
          <option value="plain">일반 품질만</option>
          <option value="quality">★ 품질만</option>
          <option value="craftOnly">제작 전용만</option>
          <option value="masterwork">명장만</option>
          <option value="all">전체 장비</option>
        </select>
        <select
          value={dismantleTierFilter}
          onChange={(e) =>
            setDismantleTierFilter(e.target.value as DismantleTierFilter)
          }
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="all">모든 티어</option>
          <option value="t4">T4-T5</option>
          <option value="t6">T6-T7</option>
          <option value="t8">T8-T9</option>
          <option value="t10">T10+</option>
        </select>
        <select
          value={dismantleSort}
          onChange={(e) => setDismantleSort(e.target.value as DismantleSortMode)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="tier">티어 높은순</option>
          <option value="reward">회수량 많은순</option>
          <option value="name">이름순</option>
        </select>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>
          표시 {filteredDismantleCandidates.length.toLocaleString()}개 / 전체{" "}
          {(dismantle?.candidates.length ?? 0).toLocaleString()}개
        </span>
        <span>
          해체 가능{" "}
          {(dismantle?.candidates.filter((item) => item.canDismantle).length ?? 0).toLocaleString()}개
        </span>
      </div>
      {dismantleMessage ? (
        <div className="mb-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {dismantleMessage}
        </div>
      ) : null}
      {dismantleResult ? (
        <div className="mb-2 overflow-hidden rounded border border-rose-200 bg-white text-xs dark:border-rose-900 dark:bg-zinc-950">
          <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900 dark:bg-rose-950/30">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-rose-950 dark:text-rose-100">
                해체 완료
              </span>
              <CraftQualityBadge level={dismantleResult.craftQualityLevel} />
              {dismantleResult.craftOnly ? <CraftOnlyBadge /> : null}
              {dismantleResult.masterwork ? <MasterworkBadge /> : null}
            </div>
          </div>
          <div className="grid gap-2 px-3 py-2 text-zinc-700 dark:text-zinc-200 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {dismantleResult.itemName}
              </div>
              <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                {V2_SLOT_LABEL[dismantleResult.slot]} · T{dismantleResult.tier}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 sm:justify-end">
              <span className="rounded bg-zinc-100 px-1.5 py-px font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {workshopMaterialRewardText(dismantleResult.rewards)}
              </span>
              {dismantleResult.artisanXp > 0 ? (
                <span className="rounded bg-emerald-100 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  숙련도 +{dismantleResult.artisanXp.toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        {filteredDismantleCandidates.slice(0, 40).map((item) => {
          const busy = dismantleBusyIid === item.iid;
          return (
            <div
              key={item.iid}
              className={`ui-recipe-row rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 ${
                item.canDismantle ? "ui-codex-card is-ready" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="truncate">{item.itemName}</span>
                    <EnhanceLevelBadge level={item.enhanceLevel} />
                    <CraftQualityBadge level={item.craftQualityLevel} />
                    {item.craftOnly ? <CraftOnlyBadge /> : null}
                    {item.masterwork ? <MasterworkBadge /> : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {V2_SLOT_LABEL[item.slot]} · T{item.tier} ·{" "}
                    {workshopMaterialRewardText(item.rewards)}
                  </div>
                  {item.artisanXp > 0 ? (
                    <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                      대장장이 숙련도 +{item.artisanXp.toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={
                    !item.canDismantle ||
                    busy ||
                    dismantleBusyIid != null ||
                    dismantleLoading
                  }
                  onClick={() => void dismantleEquipment(item.iid)}
                  className="shrink-0 rounded border border-rose-700 bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-rose-500 dark:bg-rose-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {busy
                    ? "처리 중"
                    : item.canDismantle
                      ? "해체"
                      : dismantleBlockedText(item.blockedReason)}
                </button>
              </div>
            </div>
          );
        })}
        {!dismantleLoading && (dismantle?.candidates.length ?? 0) === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            해체할 장비가 없습니다.
          </div>
        ) : null}
        {!dismantleLoading &&
        (dismantle?.candidates.length ?? 0) > 0 &&
        filteredDismantleCandidates.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            현재 필터에 맞는 장비가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
