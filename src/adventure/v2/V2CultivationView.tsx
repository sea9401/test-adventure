"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { useSystemMessageState } from "./RewardToastProvider";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import {
  cultivationOutcomeLabel,
  effectiveCultivateProfile,
  V2_HYBRID_CULTIVATE_PROFILE,
  V2_SPECIALIZED_CULTIVATE_PROFILE,
  V2_STAT_CAP_BASE,
} from "@/adventure/data/v2/proficiency";
import {
  V2_CLASS_DEFS,
  parseV2Class,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { V2ClassGrid, type V2AdvanceInfo } from "./V2ClassGrid";
import { V2JobLadder, type JobLadderEntry } from "./V2JobLadder";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "./GameStateProvider";
import {
  isLifestyleMasteryJobId,
  jobIdFromLegacy,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";

// 성장의 신전 내부 탭 — 직업(전직), 수행(스탯 한계↑).
type ShrineTab = "job" | "cultivate";

// v2 수행(修行) — 직업 전직/재전직 + 사용 가능 숙련도로 현 직업군 스탯 한계치(cap)↑.
// 옛 "성장의 신전"(수동 스탯 분배) 대체. 분배는 레벨업 랜덤 성장이 담당하고, 여기서는
// 그 성장의 천장(cap)을 직업 프로필대로 끌어올린다. docs/v2-proficiency-redesign.md §4.

type StateShape = {
  ok?: boolean;
  character?: {
    level?: number;
    gold?: number;
    class?: string;
    // 코어루프 flag-on 전용(off=null).
    classDisplayName?: string | null;
    spec?: string | null;
  };
  codex?: { discovered: number; total: number };
  // stats.base = cap 클램프 후 현 스탯(직업보정 전 — cap 과 같은 스케일). 표시 "현스탯(cap)".
  // stats.total = 효과 스탯(장비 포함) — 코어루프 스탯게이트 판정 기준.
  stats?: {
    base?: Partial<Record<V2StatKey, number>>;
    total?: Partial<Record<V2StatKey, number>>;
  };
  // 직업 시스템 v2(직업 숙련도 점진 공개 전직 목록) — 코어루프 on 일 때만(off=null → V2ClassGrid).
  jobsV2?: {
    currentJobId: string;
    currentJobName: string;
    currentJobLevelCap: number;
    atLevelCap: boolean;
    revisitExpedited: boolean;
    jobs: JobLadderEntry[];
  } | null;
  proficiency?: {
    caps?: Partial<Record<V2StatKey, number>>;
    groups?: Record<string, { tier?: number; cumLevel?: number }>;
    current?: {
      group: string;
      cumLevel: number;
      points: number;
      cultivations: number;
      capGains: number;
      nextCost: number;
      cultivationPointsSpent: number;
      growthRespecPoints: number;
      cultivationResetCount: number;
      cultivationResetGoldCost: number;
      advance?: V2AdvanceInfo | null;
    };
  };
};

export function V2CultivationView({ onBack }: { onBack: () => void }) {
  const { refreshGameState, spendableGold, applyResourcePatch } = useGameState();
  // 기본 탭 = 직업(사용자 요청 순서). 수행을 기본으로 원하면 "cultivate" 로 바꾸면 됨.
  const [tab, setTab] = useState<ShrineTab>("job");
  const [group, setGroup] = useState<string>("none");
  const [usable, setUsable] = useState(0);
  const [cultivations, setCultivations] = useState(0);
  const [capGains, setCapGains] = useState(0);
  const [nextCost, setNextCost] = useState(0);
  const [cultivationPointsSpent, setCultivationPointsSpent] = useState(0);
  const [growthRespecPoints, setGrowthRespecPoints] = useState(0);
  const [cultivationResetGoldCost, setCultivationResetGoldCost] = useState(0);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [caps, setCaps] = useState<Partial<Record<V2StatKey, number>>>({});
  const [stats, setStats] = useState<Partial<Record<V2StatKey, number>>>({});
  // 레거시 직업 그리드용 — 캐릭터 + 직군 요약(도달차수·숙련도) + 현 직업군 전직 가능 여부.
  const [picker, setPicker] = useState<{
    cls: V2Class;
    level: number;
    gold: number;
    groups: Record<string, { tier?: number; cumLevel?: number }>;
    advance: V2AdvanceInfo | null;
  } | null>(null);
  // 직업 시스템 v2(직업 숙련도 점진 공개) — null(코어루프 off)이면 V2ClassGrid 폴백.
  const [jobLadder, setJobLadder] = useState<{
    currentJobId: string;
    currentJobName: string;
    rejobRequiredLevel: number;
    atLevelCap: boolean;
    revisitExpedited: boolean;
    jobs: JobLadderEntry[];
    level: number;
  } | null>(null);
  const [resolvedJobId, setResolvedJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateShape | null;
      const cur = j?.proficiency?.current;
      if (j?.ok && cur) {
        setResolvedJobId(
          j.jobsV2?.currentJobId ??
            jobIdFromLegacy(
              j.character?.class ?? "none",
              j.character?.spec ?? null,
            ),
        );
        setGroup(cur.group);
        setUsable(cur.points);
        setCultivations(cur.cultivations);
        setCapGains(cur.capGains ?? 0);
        setNextCost(cur.nextCost);
        setCultivationPointsSpent(cur.cultivationPointsSpent ?? 0);
        setGrowthRespecPoints(cur.growthRespecPoints ?? 0);
        setCultivationResetGoldCost(cur.cultivationResetGoldCost ?? 0);
        setCaps(j.proficiency?.caps ?? {});
        setStats(j.stats?.base ?? {});
        if (j.character) {
          setPicker({
            cls: parseV2Class(j.character.class),
            level: j.character.level ?? 1,
            gold: j.character.gold ?? 0,
            groups: j.proficiency?.groups ?? {},
            advance: cur.advance ?? null,
          });
        }
        // 코어루프 on(jobsV2 비null)이면 점진 공개 사다리. off 면 null → 레거시 V2ClassGrid 폴백.
        setJobLadder(
          j.jobsV2
            ? {
                currentJobId: j.jobsV2.currentJobId,
                currentJobName: j.jobsV2.currentJobName,
                rejobRequiredLevel: j.jobsV2.currentJobLevelCap,
                atLevelCap: j.jobsV2.atLevelCap,
                revisitExpedited: j.jobsV2.revisitExpedited,
                jobs: j.jobsV2.jobs,
                level: j.character?.level ?? 1,
              }
            : null,
        );
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 성장 상태 fetch
    refresh();
  }, [refresh]);

  // 하이브리드와 방패 전문 계보는 직군 공용값 대신 직업 정체성 프로필로 한계를 올린다.
  const jobId = jobLadder?.currentJobId ?? resolvedJobId;
  const usesJobCultivationProfile = !!(
    jobId &&
    (V2_HYBRID_CULTIVATE_PROFILE[jobId] ||
      V2_SPECIALIZED_CULTIVATE_PROFILE[jobId])
  );
  const isLifestyleJob = !!(jobId && isLifestyleMasteryJobId(jobId));
  const profile = effectiveCultivateProfile(group, jobId) ?? null;
  const disciplineName = usesJobCultivationProfile || isLifestyleJob
    ? (jobLadder?.currentJobName ??
      (jobId ? V2_JOB_CATALOG[jobId]?.name : "") ??
      "")
    : group !== "none"
      ? V2_CLASS_DEFS[group as V2Class]?.group ?? ""
      : "";
  const canCultivate =
    !!profile && !isLifestyleJob && !busy && usable >= nextCost && nextCost > 0;
  const cultivate = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/cultivate", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        spent?: number;
        mult?: number;
        caps?: Partial<Record<V2StatKey, number>>;
        cultivations?: number;
        capGains?: number;
        points?: number;
        nextCost?: number;
        cultivationPointsSpent?: number;
        redistributedGrowthPoints?: number;
        growthRespecPoints?: number;
        required?: number;
        have?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "no_class"
            ? "직업이 없어요 (먼저 직업을 선택하세요)"
            : j?.error === "lifestyle_job"
              ? "생활직은 수행할 수 없습니다"
            : j?.error === "insufficient_proficiency"
              ? `숙달 포인트 부족 (필요 ${j.required ?? nextCost}, 보유 ${j.have ?? usable})`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      const outcome = cultivationOutcomeLabel(j.mult ?? 1);
      const special = outcome ? ` · ${outcome} ×${j.mult}!` : "";
      const redistributed = j.redistributedGrowthPoints ?? 0;
      const redistribution =
        redistributed > 0
          ? ` · 성장 재분배 +${redistributed} (대기 ${(j.growthRespecPoints ?? 0).toLocaleString()})`
          : "";
      setMsg(
        `✓ 수행 완료 (숙달 포인트 -${j.spent ?? nextCost})${special}${redistribution}`,
      );
      setCaps(j.caps ?? caps);
      setCultivations(j.cultivations ?? cultivations + 1);
      setCapGains(j.capGains ?? capGains);
      setUsable(j.points ?? Math.max(0, usable - nextCost));
      setCultivationPointsSpent(
        j.cultivationPointsSpent ?? cultivationPointsSpent + (j.spent ?? nextCost),
      );
      setGrowthRespecPoints(j.growthRespecPoints ?? growthRespecPoints);
      setNextCost(j.nextCost ?? nextCost);
      if (redistributed > 0) {
        await Promise.all([refresh(), refreshGameState()]);
      }
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [
    capGains,
    caps,
    cultivationPointsSpent,
    cultivations,
    growthRespecPoints,
    usable,
    nextCost,
    refresh,
    refreshGameState,
    setMsg,
  ]);

  const resetCultivationState = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/cultivate/reset", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        requiredGold?: number;
        spentGold?: number;
        refundedPoints?: number;
        gold?: number;
        bankedGold?: number;
        growthRespecPoints?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "nothing_to_reset"
            ? "초기화할 수행 한계치가 없습니다."
            : j?.error === "insufficient_gold"
              ? `골드 부족 (필요 ${(j.requiredGold ?? cultivationResetGoldCost).toLocaleString()} G)`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      applyResourcePatch({
        gold: j.gold,
        bankedGold: j.bankedGold,
      });
      setResetConfirming(false);
      await Promise.all([refresh(), refreshGameState()]);
      const costLabel = (j.spentGold ?? 0) > 0
        ? ` · 골드 -${(j.spentGold ?? 0).toLocaleString()} G`
        : " · 첫 초기화 무료";
      setMsg(
        `✓ 수행 초기화 완료 · 숙달 포인트 +${(j.refundedPoints ?? 0).toLocaleString()} · 성장 재분배 대기 ${(j.growthRespecPoints ?? 0).toLocaleString()}${costLabel}`,
      );
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [
    applyResourcePatch,
    cultivationResetGoldCost,
    refresh,
    refreshGameState,
    setMsg,
  ]);

  return (
    <PageShell spacing="tight">
      <SubViewHeader title="성장의 신전" onBack={onBack} />

      <HeaderPanel className="py-2">
        <TabBar
          tabs={[
            { key: "job", label: "직업" },
            { key: "cultivate", label: "수행" },
          ]}
          active={tab}
          onChange={(next) => {
            setTab(next);
            setResetConfirming(false);
            setMsg(null);
          }}
          ariaLabel="성장의 신전 탭"
          size="md"
        />
      </HeaderPanel>

      {/* === 직업 탭 — 코어루프 on=직업 숙련도 전직/재전직, off=기존 차수 전직 그리드 === */}
      {tab === "job" &&
        (picker ? (
          jobLadder ? (
            <V2JobLadder
              level={jobLadder.level}
              currentJobName={jobLadder.currentJobName}
              currentJobId={jobLadder.currentJobId}
              atLevelCap={jobLadder.atLevelCap}
              revisitExpedited={jobLadder.revisitExpedited}
              rejobRequiredLevel={jobLadder.rejobRequiredLevel}
              jobs={jobLadder.jobs}
              onChanged={async () => {
                await Promise.all([refresh(), refreshGameState()]);
              }}
            />
          ) : (
            // 코어루프 off 폴백 — 옛 4직군 그리드(코어루프 on 이면 위 사다리가 항상 렌더).
            <V2ClassGrid
              currentClass={picker.cls}
              level={picker.level}
              gold={picker.gold}
              groups={picker.groups}
              advance={picker.advance}
              onChanged={async () => {
                await Promise.all([refresh(), refreshGameState()]);
              }}
            />
          )
        ) : (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "직업 정보를 불러오지 못했어요."}
            </p>
          </Card>
        ))}

      {/* === 수행 탭 — 숙달 포인트로 스탯 한계치↑ === */}
      {tab === "cultivate" && (
        <>
          <Card padding="md">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {disciplineName ? `${disciplineName} 수행` : "수행"}
              </h2>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                숙달 포인트{" "}
                <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  {usable}
                </strong>
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              숙달 포인트로 스탯 한계치를 올리면, 레벨업 성장과 재분배 대기
              포인트가 그 한계까지 채운다.
            </p>

            {growthRespecPoints > 0 ? (
              <p
                className={`${SURFACE_INSET} mt-3 px-3 py-2 text-xs text-amber-700 dark:text-amber-300`}
              >
                재분배 대기 성장 포인트 {growthRespecPoints.toLocaleString()} · 다시
                수행하면 현재 직업의 수행 스탯에 배분됩니다.
              </p>
            ) : null}

            {isLifestyleJob ? (
              <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                생활직은 수행할 수 없습니다. 전투직으로 전직한 뒤 이용해 주세요.
              </p>
            ) : null}

            {loading ? (
              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                불러오는 중…
              </p>
            ) : !profile ? (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                직업이 없어 수행할 수 없어요. 먼저 직업을 선택하세요.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {V2_STAT_KEYS.map((k) => {
                  const cap = caps[k] ?? V2_STAT_CAP_BASE;
                  const cur = stats[k] ?? 0;
                  const gain = isLifestyleJob ? 0 : (profile[k] ?? 0);
                  return (
                    <li
                      key={k}
                      className={`${SURFACE_INSET} flex min-h-11 items-center justify-between gap-3 px-3 py-2`}
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="text-sm font-semibold uppercase">
                          {k.toUpperCase()}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {V2_STAT_LABELS[k]}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 tabular-nums text-sm">
                        {/* 현스탯(한계) — 예 200(300). 수행은 한계만 올림. */}
                        <span className="font-semibold">
                          {cur}
                          <span className="font-normal text-zinc-500 dark:text-zinc-400">
                            ({cap})
                          </span>
                        </span>
                        {gain > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            한계 +{gain}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {profile && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    한계 증가 합 {capGains.toLocaleString()} · 수행{" "}
                    {cultivations.toLocaleString()}회 · 다음 비용{" "}
                    <strong
                      className={`tabular-nums ${
                        usable >= nextCost
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {nextCost}
                    </strong>
                  </span>
                  <Button
                    onClick={cultivate}
                    disabled={!canCultivate}
                    title={
                      isLifestyleJob
                        ? "생활직은 수행할 수 없습니다."
                        : undefined
                    }
                    variant="success"
                    size="md"
                  >
                    {busy ? "처리 중…" : isLifestyleJob ? "수행 불가" : "수행"}
                  </Button>
                </div>

                <div className="border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
                      <p>
                        수행 초기화 · 환급 숙달 포인트{" "}
                        <strong className="tabular-nums text-zinc-800 dark:text-zinc-200">
                          {cultivationPointsSpent.toLocaleString()}
                        </strong>
                      </p>
                      <p className="mt-0.5">
                        비용{" "}
                        <strong
                          className={`tabular-nums ${
                            spendableGold >= cultivationResetGoldCost
                              ? "text-zinc-800 dark:text-zinc-200"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {cultivationResetGoldCost === 0
                            ? "첫 1회 무료"
                            : `${cultivationResetGoldCost.toLocaleString()} G`}
                        </strong>
                      </p>
                    </div>
                    <Button
                      onClick={() => setResetConfirming(true)}
                      disabled={busy || capGains <= 0}
                      variant="warning"
                      size="sm"
                    >
                      수행 초기화
                    </Button>
                  </div>

                  {resetConfirming && (
                    <div className={`${SURFACE_INSET} mt-3 p-3`}>
                      <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                        모든 수행 한계치를 초기화할까요?
                      </p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                        대성공·각성 결과를 포함한 한계 증가치가 모두 사라집니다.
                        사용한 숙달 포인트 {cultivationPointsSpent.toLocaleString()}은
                        전액 돌려받습니다. 적용 중인 레벨 성장값은 재분배 대기
                        포인트로 전환되며, 다시 수행할 때 현재 직업의 수행 스탯에
                        배분됩니다. 수행 횟수와 직업 숙련도는 유지됩니다.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          onClick={() => setResetConfirming(false)}
                          disabled={busy}
                          variant="secondary"
                          size="sm"
                        >
                          취소
                        </Button>
                        <Button
                          onClick={resetCultivationState}
                          disabled={
                            busy ||
                            capGains <= 0 ||
                            spendableGold < cultivationResetGoldCost
                          }
                          variant="danger"
                          size="sm"
                        >
                          {busy
                            ? "초기화 중…"
                            : cultivationResetGoldCost === 0
                              ? "무료로 초기화"
                              : `${cultivationResetGoldCost.toLocaleString()} G 지불`}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {msg && (
            <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
              {msg}
            </StatusBanner>
          )}
        </>
      )}
    </PageShell>
  );
}
