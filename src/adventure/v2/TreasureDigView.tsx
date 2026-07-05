"use client";

import {
  TREASURE_SELL_GOLD_MULT,
  formatCondition,
} from "@/adventure/data/v2/antique";

import { useCallback, useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import {
  MIN_EXPOSURE_TO_EXTRACT,
  TREASURE_ACTION_HELP,
  TREASURE_ACTION_LABEL,
  TREASURE_SITE_OPTIONS,
  type TreasureAction,
  type TreasureSiteOptionId,
  type TreasureSitePublic,
} from "./treasureDig";
import { FRAGMENTS_PER_MAP } from "./treasureFragments";

export type DugAntique = {
  instanceId: string;
  antiqueId: string;
  name: string;
  tier: string;
  condition: number;
  conditionBonus?: number;
  appraisalBonusPct?: number;
  appraisedValue: number;
};

export type OpenOutcome =
  | {
      ok: true;
      resumed: boolean;
      site: TreasureSitePublic;
      fragments?: number;
      needed?: number;
      baseNeeded?: number;
      mapWorkshopLevel?: number;
      discountPct?: number;
    }
  | {
      ok: false;
      reason: "not_enough_fragments" | "error";
      fragments?: number;
      needed?: number;
      baseNeeded?: number;
      mapWorkshopLevel?: number;
      discountPct?: number;
    };

export type TreasureFragmentStatus = {
  fragments: number;
  needed: number;
  baseNeeded: number;
  mapWorkshopLevel: number;
  discountPct: number;
};

export type DigOutcome =
  | {
      outcome: "hit";
      antique: DugAntique;
      grantedTitles?: { titleId: string; name: string }[];
      codexCount: number;
    }
  | { outcome: "progress"; message: string; site: TreasureSitePublic }
  | {
      outcome: "exhausted";
      message: string;
      site: TreasureSitePublic;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | { outcome: "invalid"; site: TreasureSitePublic }
  | { outcome: "error" };

export type TreasureHandlers = {
  open: (siteOptionId: TreasureSiteOptionId) => Promise<OpenOutcome>;
  dig: (siteId: string, action: TreasureAction) => Promise<DigOutcome>;
  loadFragments?: () => Promise<TreasureFragmentStatus | null>;
  loadSession?: () => Promise<TreasureSitePublic | null>;
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

const TIER_STYLE: Record<string, string> = {
  common: "text-zinc-600 dark:text-zinc-300",
  uncommon: "text-emerald-700 dark:text-emerald-300",
  rare: "text-sky-700 dark:text-sky-300",
  epic: "text-violet-700 dark:text-violet-300",
  legendary: "text-amber-600 dark:text-amber-300",
};

const ACTIONS: TreasureAction[] = ["probe", "shovel", "brush", "stabilize", "extract"];

type Result =
  | {
      kind: "hit";
      antique: DugAntique;
      grantedTitles: { titleId: string; name: string }[];
    }
  | {
      kind: "exhausted";
      message: string;
      missed: { antiqueId: string; name: string; tier: string };
    }
  | null;

function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose" | "sky";
}) {
  const fill = {
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
  }[tone];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">{label}</span>
        <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function applyFragmentMeta(
  outcome: { needed?: number; baseNeeded?: number; mapWorkshopLevel?: number; discountPct?: number },
  setters: {
    setFragmentCost: (n: number) => void;
    setBaseFragmentCost: (n: number) => void;
    setMapWorkshopLevel: (n: number) => void;
    setDiscountPct: (n: number) => void;
  },
) {
  if (typeof outcome.needed === "number") setters.setFragmentCost(outcome.needed);
  if (typeof outcome.baseNeeded === "number") setters.setBaseFragmentCost(outcome.baseNeeded);
  if (typeof outcome.mapWorkshopLevel === "number") {
    setters.setMapWorkshopLevel(outcome.mapWorkshopLevel);
  }
  if (typeof outcome.discountPct === "number") setters.setDiscountPct(outcome.discountPct);
}

export function TreasureDigView({
  open,
  dig,
  loadFragments,
  loadSession,
  onBack,
  onOpenCollection,
  onOpenLeaderboard,
  onOpenShop,
}: TreasureHandlers & {
  onBack?: () => void;
  onOpenCollection?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenShop?: () => void;
}) {
  const [site, setSite] = useState<TreasureSitePublic | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fragments, setFragments] = useState<number | null>(null);
  const [fragmentCost, setFragmentCost] = useState(FRAGMENTS_PER_MAP);
  const [baseFragmentCost, setBaseFragmentCost] = useState(FRAGMENTS_PER_MAP);
  const [mapWorkshopLevel, setMapWorkshopLevel] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [selectedSiteOptionId, setSelectedSiteOptionId] =
    useState<TreasureSiteOptionId>(TREASURE_SITE_OPTIONS[0].id);
  const [restoring, setRestoring] = useState(Boolean(loadSession));

  useEffect(() => {
    if (!loadFragments) return;
    let alive = true;
    void loadFragments().then((status) => {
      if (alive && status) {
        setFragments(status.fragments);
        setFragmentCost(status.needed);
        setBaseFragmentCost(status.baseNeeded);
        setMapWorkshopLevel(status.mapWorkshopLevel);
        setDiscountPct(status.discountPct);
      }
    });
    return () => {
      alive = false;
    };
  }, [loadFragments]);

  useEffect(() => {
    if (!loadSession) return;
    let alive = true;
    void loadSession()
      .then((s) => {
        if (alive && s) {
          setSite(s);
          setSelectedSiteOptionId(s.siteOption.id);
          setResult(null);
        }
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [loadSession]);

  const handleOpen = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await open(selectedSiteOptionId);
      applyFragmentMeta(r, {
        setFragmentCost,
        setBaseFragmentCost,
        setMapWorkshopLevel,
        setDiscountPct,
      });
      if (typeof r.fragments === "number") setFragments(r.fragments);
      if (!r.ok) {
        setNotice(
          r.reason === "not_enough_fragments"
            ? `지도 조각이 부족합니다 (${r.fragments ?? 0}/${r.needed ?? fragmentCost}). 낚시·사냥으로 모으세요.`
            : "발굴 지점을 열 수 없습니다.",
        );
      } else {
        setSite(r.site);
        setSelectedSiteOptionId(r.site.siteOption.id);
        setResult(null);
      }
    } catch {
      setNotice("발굴 지점을 열 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }, [fragmentCost, open, selectedSiteOptionId]);

  const handleAction = useCallback(
    async (action: TreasureAction) => {
      if (!site || busy || result) return;
      setBusy(true);
      setNotice(null);
      try {
        const r = await dig(site.siteId, action);
        switch (r.outcome) {
          case "hit":
            setResult({
              kind: "hit",
              antique: r.antique,
              grantedTitles: r.grantedTitles ?? [],
            });
            break;
          case "exhausted":
            setSite(r.site);
            setResult({ kind: "exhausted", message: r.message, missed: r.missed });
            break;
          case "progress":
            setSite(r.site);
            setNotice(r.message);
            break;
          case "invalid":
            setSite(r.site);
            break;
          case "error":
            setNotice("발굴 중 오류가 발생했습니다.");
            break;
        }
      } catch {
        setNotice("발굴 중 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [site, busy, result, dig],
  );

  const selectedSite = TREASURE_SITE_OPTIONS.find((s) => s.id === selectedSiteOptionId);
  const actionsRemaining = site ? site.actionsAllowed - site.actionsUsed : 0;
  const canProgress = !!site && !site.forcedExtract && !result;

  return (
    <main className="mx-auto max-w-[560px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="보물 발굴"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            지도 조각 {fragments ?? "..."}개
          </span>
        }
      />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        유물을 드러내되 망가뜨리지 마세요. 충분히 노출되면 회수할 수 있지만,
        위험을 방치하면 발굴 지점이 무너집니다.
      </p>

      <TreasureSubTabs
        active="dig"
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenCollection={onOpenCollection}
        onOpenShop={onOpenShop}
      />

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {notice}
        </div>
      )}

      {!site && !restoring && (
        <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            탐사지 선택
          </p>
          <div className="grid gap-2">
            {TREASURE_SITE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelectedSiteOptionId(option.id)}
                className={`rounded-md border p-3 text-left transition ${
                  selectedSiteOptionId === option.id
                    ? "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="block text-sm font-semibold">{option.name}</span>
                <span className="mt-1 block">{option.summary}</span>
                <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                  {option.effectLabel}
                </span>
              </button>
            ))}
          </div>
          <div className="rounded bg-zinc-50 p-3 text-[11px] dark:bg-zinc-800/70">
            <div>
              필요 지도 조각 {fragmentCost}개
              {discountPct > 0 && (
                <span className="ml-1 text-emerald-700 dark:text-emerald-300">
                  (지도 제작소 Lv.{mapWorkshopLevel}로 {baseFragmentCost}개에서 {discountPct}% 감소)
                </span>
              )}
            </div>
            <div className="mt-1">
              {selectedSite?.name}에서 노출도와 보존도를 관리하며 유물을 회수합니다.
            </div>
          </div>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>탐침, 삽질, 붓질, 보강을 골라 노출도와 확신도를 올립니다.</li>
            <li>
              노출도 {MIN_EXPOSURE_TO_EXTRACT}%부터 회수할 수 있습니다. 보존도는 최종
              감정가에 반영됩니다.
            </li>
          </ol>
        </div>
      )}

      {site && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {site.siteOption.name} · 남은 행동{" "}
                <b className="tabular-nums text-zinc-800 dark:text-zinc-100">
                  {Math.max(0, actionsRemaining)}
                </b>
                /{site.actionsAllowed}
              </span>
              <span>{site.canExtract ? "회수 가능" : "노출 부족"}</span>
            </div>
            <Meter label="노출도" value={site.exposure} tone="amber" />
            <Meter label="보존도" value={site.preservation} tone="emerald" />
            <Meter label="붕괴 위험" value={site.risk} tone="rose" />
            <Meter label="확신도" value={site.certainty} tone="sky" />
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">판독 결과</h2>
              {site.forcedExtract && !result && (
                <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
                  회수만 가능
                </span>
              )}
            </div>
            <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              {site.fieldEvent
                ? `${site.fieldEvent.name} · ${site.fieldEvent.effectLabel}`
                : "특수 현장 없음"}
            </div>
            {site.hints.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {site.hints.map((h) => (
                  <span
                    key={h.key}
                    className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    {h.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                아직 유물의 성격을 읽지 못했습니다.
              </p>
            )}
          </div>

          {!result && (
            <div className="grid grid-cols-2 gap-2">
              {ACTIONS.map((action) => {
                const isExtract = action === "extract";
                const disabled =
                  busy || (!isExtract && !canProgress) || (site.forcedExtract && !isExtract);
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleAction(action)}
                    title={TREASURE_ACTION_HELP[action]}
                    className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isExtract
                        ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                        : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="block">{TREASURE_ACTION_LABEL[action]}</span>
                    <span className="mt-1 block text-[11px] font-normal opacity-70">
                      {TREASURE_ACTION_HELP[action]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {site.actions.length > 0 && (
            <div className="rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <div className="mb-2 font-semibold text-zinc-800 dark:text-zinc-100">
                발굴 기록
              </div>
              <div className="space-y-1.5">
                {site.actions.slice().reverse().map((a, idx) => (
                  <div key={`${a.action}-${site.actions.length - idx}`} className="flex gap-2">
                    <span className="shrink-0 text-zinc-400">
                      {site.actions.length - idx}회
                    </span>
                    <span className="min-w-0 flex-1">
                      <b>{TREASURE_ACTION_LABEL[a.action]}</b> · {a.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result?.kind === "hit" && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">발굴 성공</p>
          <p className="mt-1 text-lg font-bold">
            {result.antique.name}{" "}
            <span className={`text-sm ${TIER_STYLE[result.antique.tier] ?? ""}`}>
              ({TIER_LABEL[result.antique.tier] ?? result.antique.tier})
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            보존상태 {formatCondition(result.antique.condition)}
            {result.antique.conditionBonus ? ` · 보존 보너스 +${result.antique.conditionBonus}` : ""}
            {result.antique.appraisalBonusPct
              ? ` · 감정가 +${result.antique.appraisalBonusPct}%`
              : ""}{" "}
            · 판매가{" "}
            {(result.antique.appraisedValue * TREASURE_SELL_GOLD_MULT).toLocaleString()}골드
          </p>
          {result.grantedTitles.length > 0 && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              칭호 획득: {result.grantedTitles.map((t) => t.name).join(", ")}
            </p>
          )}
        </div>
      )}

      {result?.kind === "exhausted" && (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">발굴 실패</p>
          <p className="mt-1 text-sm">{result.message}</p>
          <p className="mt-1 text-sm">
            잃어버린 유물:{" "}
            <span className="font-bold">
              {result.missed.name}{" "}
              <span className={TIER_STYLE[result.missed.tier] ?? ""}>
                ({TIER_LABEL[result.missed.tier] ?? result.missed.tier})
              </span>
            </span>
          </p>
        </div>
      )}

      {(!site || result) && !restoring ? (
        <button
          type="button"
          disabled={busy || (fragments !== null && fragments < fragmentCost)}
          onClick={handleOpen}
          className="w-full rounded-md bg-zinc-900 py-2.5 text-sm font-semibold text-zinc-50 transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy
            ? "여는 중..."
            : fragments !== null && fragments < fragmentCost
              ? `지도 조각 부족 (${fragments}/${fragmentCost})`
              : `${result ? "다시 발굴하기" : "발굴 지점 열기"} (지도 조각 ${fragmentCost}개)`}
        </button>
      ) : null}
    </main>
  );
}
