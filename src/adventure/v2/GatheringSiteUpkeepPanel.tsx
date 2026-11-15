"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  GATHERING_PIONEER_TITLE_ID,
  GATHERING_SITE_MASTER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import { MINING_MATERIALS, type MiningMaterialId } from "@/adventure/data/v2/miningSpots";
import { autoGatheringDurationLabel } from "./autoGathering";
import {
  GATHERING_SITES,
  GATHERING_SITE_BASE_MAX_STAGE,
  GATHERING_SITE_TITLE_TOTAL_STAGE,
  GatheringSiteUpkeepError,
  gatheringSiteBlockReason,
  gatheringSiteCost,
  gatheringSiteExtendedDurationMs,
  gatheringSiteStage,
  gatheringSiteTotalStage,
  upkeepGatheringSite,
  type GatheringSite,
  type GatheringSiteActivity,
  type GatheringSiteId,
  type GatheringSiteUpkeepView,
} from "./gatheringSiteUpkeep";
import {
  fetchGatheringSiteUpkeep,
  gatheringSiteUpkeepErrorLabel,
  requestGatheringSiteUpkeep,
} from "./gatheringSiteUpkeepClient";
import { LIFE_MAJOR_PRODUCTS } from "./lifeMajorProducts";
import { LIFE_MAJOR_CRAFT_MIN_STAGE } from "./lifeMajorRules";

const ENOUGH_CLASS = "text-zinc-600 dark:text-zinc-300";
const SHORT_CLASS = "text-rose-600 dark:text-rose-400";
const ACTIVITY_NAME: Record<GatheringSiteActivity, string> = {
  mining: "채광",
  woodcutting: "벌목",
};
const GROUPS: ReadonlyArray<{ activity: GatheringSiteActivity; label: string }> = [
  { activity: "mining", label: "광맥" },
  { activity: "woodcutting", label: "숲" },
];

type Notice = { tone: "success" | "error"; text: string };

function extendedLabel(stage: number): string {
  return `느긋한 작업 ${autoGatheringDurationLabel(gatheringSiteExtendedDurationMs(stage))}`;
}

// 생활 공방의 "채집지 정비" 탭 — 광맥·숲마다 원자재와 부산물로 정비 단계를 올린다.
// preview 를 주면 요청 없이 그 값으로 그리고, 정비도 화면 안에서만 반영한다(개발용 미리보기).
export function GatheringSiteUpkeepPanel({
  preview,
  onChanged,
}: {
  preview?: GatheringSiteUpkeepView;
  onChanged?: () => void;
}) {
  const [view, setView] = useState<GatheringSiteUpkeepView | null>(preview ?? null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busySiteId, setBusySiteId] = useState<GatheringSiteId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void fetchGatheringSiteUpkeep().then((next) => {
      if (cancelled) return;
      if (next) setView(next);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  if (loadFailed) {
    return (
      <section className={`${SURFACE_CARD} p-3 text-sm text-zinc-600 dark:text-zinc-300`}>
        채집지 정비 정보를 불러오지 못했습니다.
      </section>
    );
  }
  if (!view) return null;

  const succeeded = (site: GatheringSite, next: GatheringSiteUpkeepView, titleIds: string[]) => {
    const stage = gatheringSiteStage(next.stages, site.id);
    const titles = titleIds.flatMap((id) => (TITLES[id] ? [`칭호 ${TITLES[id].name} 획득`] : []));
    setView(next);
    setNotice({
      tone: "success",
      text: [`${site.name}을 ${stage}단계로 정비했습니다. ${extendedLabel(stage)}`, ...titles].join(
        " · ",
      ),
    });
    onChanged?.();
  };

  const upkeep = async (site: GatheringSite) => {
    setNotice(null);
    if (preview) {
      try {
        const done = upkeepGatheringSite(view.stages, site.id, view);
        succeeded(site, { ...view, stages: done.state, materials: done.materials }, []);
      } catch (error) {
        setNotice({
          tone: "error",
          text: gatheringSiteUpkeepErrorLabel(
            error instanceof GatheringSiteUpkeepError ? error.code : null,
          ),
        });
      }
      return;
    }
    setBusySiteId(site.id);
    const response = await requestGatheringSiteUpkeep(site.id);
    setBusySiteId(null);
    if (response.ok) succeeded(site, response.view, response.grantedTitleIds);
    else setNotice({ tone: "error", text: gatheringSiteUpkeepErrorLabel(response.error) });
  };

  const totalStage = gatheringSiteTotalStage(view.stages);
  const baseMaxCount = GATHERING_SITES.filter(
    (site) => gatheringSiteStage(view.stages, site.id) >= GATHERING_SITE_BASE_MAX_STAGE,
  ).length;

  return (
    <section className={`${SURFACE_CARD} p-3`} aria-labelledby="gathering-upkeep-title">
      <h2 id="gathering-upkeep-title" className="font-bold text-zinc-900 dark:text-zinc-100">
        채집지 정비
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        채집지를 정비하면 그곳의 느긋한 자동 작업 시간이 길어집니다. 재료 효율은 그대로입니다.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 pt-3 text-xs tabular-nums text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          정비 단계 합계 {totalStage}
        </span>
        <span>
          {TITLES[GATHERING_PIONEER_TITLE_ID].name}{" "}
          {Math.min(totalStage, GATHERING_SITE_TITLE_TOTAL_STAGE)} /{" "}
          {GATHERING_SITE_TITLE_TOTAL_STAGE}
        </span>
        <span>
          {TITLES[GATHERING_SITE_MASTER_TITLE_ID].name} {baseMaxCount} / {GATHERING_SITES.length}
        </span>
      </div>

      {notice ? (
        <StatusBanner tone={notice.tone} className="mt-3">
          {notice.text}
        </StatusBanner>
      ) : null}

      {GROUPS.map((group) => (
        <div key={group.activity} className="mt-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.label}</h3>
          <ul className="mt-1 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
            {GATHERING_SITES.filter((site) => site.activity === group.activity).map((site) => (
              <UpkeepRow
                key={site.id}
                site={site}
                view={view}
                busy={busySiteId === site.id}
                anyBusy={busySiteId !== null}
                onUpkeep={upkeep}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function UpkeepRow({
  site,
  view,
  busy,
  anyBusy,
  onUpkeep,
}: {
  site: GatheringSite;
  view: GatheringSiteUpkeepView;
  busy: boolean;
  anyBusy: boolean;
  onUpkeep: (site: GatheringSite) => void;
}) {
  const stage = gatheringSiteStage(view.stages, site.id);
  const cost = gatheringSiteCost(site.id, stage + 1);
  const blocked = gatheringSiteBlockReason(view.stages, site.id, view);
  const held = (id: string) => view.materials[id] ?? 0;

  return (
    <li
      data-testid={`gathering-upkeep-${site.id}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
            {site.name}
          </span>
          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {stage}단계
          </span>
          <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
            {extendedLabel(stage)}
          </span>
        </p>
        {cost ? (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
            <CostAmount
              name={site.materialName}
              held={held(cost.materialId)}
              need={cost.materials}
            />
            <CostAmount
              name={MINING_MATERIALS[cost.byproductId as MiningMaterialId].name}
              held={held(cost.byproductId)}
              need={cost.byproducts}
            />
            {cost.masterProducts > 0 ? (
              <CostAmount
                name={LIFE_MAJOR_PRODUCTS[site.activity].name}
                held={held(cost.masterProductId)}
                need={cost.masterProducts}
              />
            ) : null}
          </p>
        ) : null}
        {blocked === "upkeep_master_locked" ? (
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {ACTIVITY_NAME[site.activity]} 주전공 명장 {LIFE_MAJOR_CRAFT_MIN_STAGE}단계부터 올릴 수
            있습니다.
          </p>
        ) : null}
      </div>
      {cost ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-10"
          aria-label={`${site.name} 정비`}
          disabled={blocked !== null || anyBusy}
          onClick={() => onUpkeep(site)}
        >
          {busy ? "정비 중..." : "정비"}
        </Button>
      ) : (
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">최고 단계</span>
      )}
    </li>
  );
}

function CostAmount({ name, held, need }: { name: string; held: number; need: number }) {
  return (
    <span className={held >= need ? ENOUGH_CLASS : SHORT_CLASS}>
      {name} {held.toLocaleString("ko-KR")} / {need.toLocaleString("ko-KR")}
    </span>
  );
}
