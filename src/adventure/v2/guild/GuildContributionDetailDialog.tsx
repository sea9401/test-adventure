"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import {
  GUILD_CONTRIBUTION_CATEGORIES,
  GUILD_CONTRIBUTION_CATEGORY_LABEL,
} from "@/adventure/data/v2/guildContribution";
import {
  SETTLEMENT_DONATION_MATERIAL_IDS,
  settlementDonationMaterialName,
  type SettlementDonationMaterialId,
} from "@/adventure/data/v2/settlement";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import type {
  GuildContributionDetailMeta,
  GuildContributionDetailResponse,
} from "./guildShared";

const SOURCE_LABEL: Record<string, string> = {
  gold_deposit: "길드 자금 기부",
  facility_material_donation: "시설 재료 기부",
  workshop_delivery: "제작소 납품",
  workshop_craft_only: "제작소 제작",
  artisan_rank_reward: "제작 숙련 보상",
  training_drill_claim: "훈련 완료",
  alchemy_craft: "연금 제작",
  dining_ingredient_donation: "식당 재료 기부",
  trade_delivery: "교역소 납품",
  trade_contract_complete: "교역 계약 완료",
};

function roleLabel(role: string): string {
  if (role === "master") return "길드장";
  if (role === "manager") return "관리자";
  return "길드원";
}

function isDonationMaterialId(value: string): value is SettlementDonationMaterialId {
  return SETTLEMENT_DONATION_MATERIAL_IDS.includes(
    value as SettlementDonationMaterialId,
  );
}

export function guildContributionEventDetail(
  source: string,
  meta: GuildContributionDetailMeta | null,
): string | null {
  if (!meta) return null;
  if (source === "gold_deposit" && (meta.amount ?? 0) > 0) {
    return `${meta.amount!.toLocaleString()} G`;
  }
  if (source === "facility_material_donation") {
    const materials = Object.entries(meta.donations ?? {})
      .filter(
        (entry): entry is [SettlementDonationMaterialId, number] =>
          isDonationMaterialId(entry[0]) && Number(entry[1]) > 0,
      )
      .map(
        ([materialId, quantity]) =>
          `${settlementDonationMaterialName(materialId)} ${quantity.toLocaleString()}개`,
      );
    if (materials.length > 0) {
      return [meta.buildingName, materials.join(" · ")].filter(Boolean).join(" · ");
    }
    if ((meta.quantity ?? 0) > 0) {
      return [meta.buildingName, `재료 ${meta.quantity!.toLocaleString()}개`]
        .filter(Boolean)
        .join(" · ");
    }
  }
  const title =
    meta.deliveryTitle ?? meta.questTitle ?? meta.drillTitle ?? meta.itemName;
  if (title && (meta.quantity ?? 0) > 0) {
    return `${title} ${meta.quantity!.toLocaleString()}개`;
  }
  return title ?? null;
}

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function GuildContributionDetailDialog({
  member,
  onClose,
}: {
  member: { userId: string; name: string; role: string };
  onClose: () => void;
}) {
  const [data, setData] = useState<GuildContributionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(contentRef);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/v2/guild/contributions/${encodeURIComponent(member.userId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 403 ? "forbidden" : "failed");
        }
        return (await response.json()) as GuildContributionDetailResponse;
      })
      .then(setData)
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          fetchError instanceof Error && fetchError.message === "forbidden"
            ? "상세 내역을 볼 권한이 없습니다."
            : "기여 상세 내역을 불러오지 못했어요.",
        );
      });
    return () => controller.abort();
  }, [member.userId]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guild-contribution-detail-title"
      className="ui-modal-reveal fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className={`${SURFACE_CARD} ui-modal-panel flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="min-w-0">
            <h2
              id="guild-contribution-detail-title"
              className="truncate text-base font-semibold"
            >
              {member.name} 기여 상세
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {roleLabel(member.role)} · 길드장과 관리자만 볼 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          {error ? (
            <div className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : !data ? (
            <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              상세 내역을 불러오는 중…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className={`${SURFACE_INSET} p-2.5`}>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">이번 주 기여도</div>
                  <div className="mt-1 font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                    {data.weeklyPoints.toLocaleString()}점
                  </div>
                </div>
                <div className={`${SURFACE_INSET} p-2.5`}>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">누적 기여도</div>
                  <div className="mt-1 font-semibold tabular-nums">
                    {data.lifetimePoints.toLocaleString()}점
                  </div>
                </div>
                <div className={`${SURFACE_INSET} p-2.5`}>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">이번 주 골드 기부</div>
                  <div className="mt-1 font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {data.weeklyGoldDeposited.toLocaleString()} G
                  </div>
                </div>
                <div className={`${SURFACE_INSET} p-2.5`}>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">누적 골드 기부</div>
                  <div className="mt-1 font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {data.lifetimeGoldDeposited.toLocaleString()} G
                  </div>
                </div>
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold">분야별 기여도</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GUILD_CONTRIBUTION_CATEGORIES.map((category) => (
                    <div key={category} className={`${SURFACE_INSET} px-2.5 py-2`}>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {GUILD_CONTRIBUTION_CATEGORY_LABEL[category]}
                      </div>
                      <div className="mt-1 text-xs font-medium tabular-nums">
                        {(data.weeklyByCategory[category] ?? 0).toLocaleString()}
                        <span className="ml-1 text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                          / {(data.lifetimeByCategory[category] ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                  이번 주 / 누적 순서입니다.
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">최근 기여 활동</h3>
                {data.events.length === 0 ? (
                  <div className={`${SURFACE_INSET} px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400`}>
                    기록된 기여 활동이 없습니다.
                  </div>
                ) : (
                  <ol className={`${SURFACE_INSET} divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-700`}>
                    {data.events.map((event) => {
                      const detail = guildContributionEventDetail(
                        event.source,
                        event.meta,
                      );
                      return (
                        <li key={event.id} className="px-3 py-2.5 text-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium">
                                {SOURCE_LABEL[event.source] ??
                                  GUILD_CONTRIBUTION_CATEGORY_LABEL[event.category]}
                              </div>
                              {detail && (
                                <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {detail}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                                +{event.points.toLocaleString()}점
                              </div>
                              <time className="mt-0.5 block text-[10px] text-zinc-400 dark:text-zinc-500">
                                {formatActivityDate(event.createdAt)}
                              </time>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
