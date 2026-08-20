"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useAdmin } from "../AdminContext";
import { adminGet, adminPost } from "../api";
import { DangerAction } from "../ui/DangerAction";
import { Button } from "../ui/Field";

type TrophyTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "legendary";
type SeasonStatus = "scheduled" | "active" | "settling" | "closed";
type OpsState = "ready" | "too_early" | "closed" | "inconsistent";
type Category = "equipment" | "fish" | "monster" | "cooking" | "life" | "job";

type SeasonSummary = {
  seasonId: string;
  themeId: string;
  themeName: string;
  definitionVersion: number;
  startAt: string;
  endAt: string;
  status: SeasonStatus;
  settledAt: string | null;
  opsState: OpsState;
  counts: {
    progress: number;
    scored: number;
    finalRanked: number;
    finalTiers: Record<TrophyTier, number>;
    trophies: number;
  };
};

type DefinitionPreview = {
  seasonId: string;
  themeId: string;
  themeName: string;
  version: number;
  startAt: string;
  endAt: string;
  primaryCategories: readonly [Category, Category];
  supportCategory: Category;
  objectiveCount: number;
  groupCounts: { basic: number; field: number; expert: number; challenge: number };
  objectiveScore: number;
  diversityScore: number;
  recordScore: number;
  schedulable: boolean;
};

type SettlementPreview = {
  seasonId: string;
  participantCount: number;
  tierCounts: Record<TrophyTier, number>;
  untieredCount: number;
  top: Array<{
    userId: string;
    rank: number;
    score: number;
    tier: TrophyTier | null;
  }>;
};

export type CodexResearchSeasonOpsData = {
  ok: true;
  seasons: SeasonSummary[];
  features: { settlementEnabled: boolean; trophiesEnabled: boolean };
  /** 정적 렌더 테스트용 초기 검증 결과. 실제 GET 응답에는 포함되지 않는다. */
  definitionPreview?: DefinitionPreview;
};

type EditorParseResult =
  | { ok: true; definition: Record<string, unknown> }
  | { ok: false; error: string };

export function parseCodexResearchDefinitionEditor(
  source: string,
): EditorParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: "정의 JSON 문법을 확인해 주세요." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "정의 JSON은 객체여야 합니다." };
  }
  return { ok: true, definition: parsed as Record<string, unknown> };
}

const TIER_LABELS: Record<TrophyTier, string> = {
  bronze: "브론즈",
  silver: "실버",
  gold: "골드",
  platinum: "플래티넘",
  diamond: "다이아몬드",
  legendary: "레전더리",
};

const STATUS_LABELS: Record<SeasonStatus, string> = {
  scheduled: "예약",
  active: "진행 중",
  settling: "결산 중",
  closed: "종료",
};

const OPS_STATE_LABELS: Record<OpsState, string> = {
  ready: "결산 가능",
  too_early: "종료 전",
  closed: "결산 완료",
  inconsistent: "정합성 확인 필요",
};

function number(value: number): string {
  return value.toLocaleString("ko-KR");
}

function shortTimestamp(value: string | null): string {
  if (!value) return "-";
  return value.replace("T", " ").replace(".000Z", "Z");
}

function FeatureState({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        enabled
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {label} {enabled ? "켜짐" : "꺼짐"}
    </span>
  );
}

function ConfirmationGuide({ seasonId }: { seasonId: string }) {
  return (
    <p className="mt-2 break-all font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
      확인 문구: SETTLE {seasonId} · RESETTLE {seasonId} · AWARD {seasonId}
    </p>
  );
}

export function CodexResearchSeasonOps({
  previewData,
}: {
  previewData?: CodexResearchSeasonOpsData;
}) {
  const { readOnly, showToast } = useAdmin();
  const [data, setData] = useState<CodexResearchSeasonOpsData | null>(
    previewData ?? null,
  );
  const [definitionSource, setDefinitionSource] = useState("");
  const [definitionPreview, setDefinitionPreview] =
    useState<DefinitionPreview | null>(previewData?.definitionPreview ?? null);
  const [settlementPreview, setSettlementPreview] =
    useState<SettlementPreview | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!previewData);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await adminGet<CodexResearchSeasonOpsData>(
        "/api/admin/codex-research-seasons",
      );
      setData(next);
    } catch (error) {
      showToast(
        `도감 연구 시즌 조회 실패: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (previewData) return;
    const controller = new AbortController();
    void adminGet<CodexResearchSeasonOpsData>(
      "/api/admin/codex-research-seasons",
      controller.signal,
    )
      .then((next) => setData(next))
      .catch((error) => {
        if (!controller.signal.aborted) {
          showToast(
            `도감 연구 시즌 조회 실패: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [previewData, showToast]);

  const validateDefinition = async () => {
    const parsed = parseCodexResearchDefinitionEditor(definitionSource);
    if (!parsed.ok) {
      setEditorError(parsed.error);
      setDefinitionPreview(null);
      return;
    }
    setRunning("validate");
    setEditorError(null);
    try {
      const response = await adminPost<{
        preview: DefinitionPreview;
      }>("/api/admin/codex-research-seasons", {
        op: "validate",
        definition: parsed.definition,
      });
      setDefinitionPreview(response.preview);
      showToast("도감 연구 정의 검증 완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      setDefinitionPreview(null);
      setEditorError(`서버 검증 실패: ${message}`);
      showToast(`도감 연구 정의 검증 실패: ${message}`);
    } finally {
      setRunning(null);
    }
  };

  const scheduleDefinition = async () => {
    if (!definitionPreview) return;
    const parsed = parseCodexResearchDefinitionEditor(definitionSource);
    if (!parsed.ok) {
      setEditorError(parsed.error);
      setDefinitionPreview(null);
      return;
    }
    setRunning("schedule");
    try {
      await adminPost("/api/admin/codex-research-seasons", {
        op: "schedule",
        definition: parsed.definition,
        confirm: `SCHEDULE ${definitionPreview.seasonId}`,
      });
      showToast(`${definitionPreview.seasonId} 도감 연구 시즌 예약 완료`);
      setDefinitionSource("");
      setDefinitionPreview(null);
      await load();
    } catch (error) {
      showToast(`시즌 예약 실패: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      setRunning(null);
    }
  };

  const previewSettlement = async (seasonId: string) => {
    setRunning(`preview:${seasonId}`);
    try {
      const response = await adminPost<{ preview: SettlementPreview }>(
        "/api/admin/codex-research-seasons",
        { op: "preview-settlement", seasonId },
      );
      setSettlementPreview(response.preview);
      showToast(`${seasonId} 결산 미리보기 완료`);
    } catch (error) {
      showToast(`결산 미리보기 실패: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      setRunning(null);
    }
  };

  const runSeasonOperation = async (
    op: "settle" | "resettle" | "award-trophies",
    seasonId: string,
  ) => {
    const prefix = op === "settle"
      ? "SETTLE"
      : op === "resettle"
        ? "RESETTLE"
        : "AWARD";
    setRunning(`${op}:${seasonId}`);
    try {
      await adminPost("/api/admin/codex-research-seasons", {
        op,
        seasonId,
        confirm: `${prefix} ${seasonId}`,
      });
      showToast(`${seasonId} ${op} 완료`);
      setSettlementPreview(null);
      await load();
    } catch (error) {
      showToast(`${seasonId} ${op} 실패: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="mt-8 space-y-5" aria-labelledby="codex-research-ops-title">
      <div className={`${SURFACE_ACCENT} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="codex-research-ops-title" className="text-lg font-bold text-amber-950 dark:text-amber-100">
              도감 연구 시즌 운영
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              월간 정의 검증 → 미래 시즌 예약 → 결산 미리보기 → 결산 → 트로피 발급 순서로
              진행합니다. 자동 예약이나 자동 결산은 없으며, 이 화면은 기능 플래그를 바꾸지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FeatureState
              label="결산"
              enabled={data?.features.settlementEnabled ?? false}
            />
            <FeatureState
              label="트로피"
              enabled={data?.features.trophiesEnabled ?? false}
            />
          </div>
        </div>
        {readOnly ? (
          <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-300">
            보기 전용 모드 — 상태와 확인 문구만 표시하며 모든 실행 버튼을 숨깁니다.
          </p>
        ) : null}
      </div>

      <div className={`${SURFACE_CARD} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold">1. 정의 검증과 예약</h4>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              검토한 정의 JSON을 붙여 넣으세요. 편집할 때마다 이전 검증 결과는 폐기됩니다.
            </p>
          </div>
          {!readOnly ? (
            <Button
              variant="primary"
              disabled={running !== null || definitionSource.trim() === ""}
              onClick={() => void validateDefinition()}
            >
              {running === "validate" ? "검증 중…" : "서버 검증"}
            </Button>
          ) : null}
        </div>
        <textarea
          aria-label="도감 연구 정의 JSON"
          value={definitionSource}
          disabled={readOnly || running !== null}
          onChange={(event) => {
            setDefinitionSource(event.target.value);
            setDefinitionPreview(null);
            setEditorError(null);
          }}
          placeholder="검토한 CodexResearchDefinitionSnapshot JSON을 붙여 넣으세요."
          spellCheck={false}
          className="mt-4 min-h-72 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        {editorError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{editorError}</p>
        ) : null}
        {definitionPreview ? (
          <div className={`${SURFACE_INSET} mt-4 p-4`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] text-zinc-500">시즌·테마</p>
                <p className="text-sm font-semibold">
                  {definitionPreview.seasonId} · {definitionPreview.themeName}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">목표 구성</p>
                <p className="text-sm font-semibold">
                  목표 {definitionPreview.objectiveCount}개 · {definitionPreview.groupCounts.basic}/
                  {definitionPreview.groupCounts.field}/{definitionPreview.groupCounts.expert}/
                  {definitionPreview.groupCounts.challenge}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">점수 예산</p>
                <p className="text-sm font-semibold">
                  총 {number(
                    definitionPreview.objectiveScore +
                    definitionPreview.diversityScore +
                    definitionPreview.recordScore,
                  )}점
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">KST 월 경계</p>
                <p className="text-xs font-medium">
                  {shortTimestamp(definitionPreview.startAt)} → {shortTimestamp(definitionPreview.endAt)}
                </p>
              </div>
            </div>
            <p className="mt-3 font-mono text-xs text-zinc-600 dark:text-zinc-300">
              확인 문구: SCHEDULE {definitionPreview.seasonId}
            </p>
            {!readOnly && definitionPreview.schedulable && definitionSource.trim() ? (
              <div className="mt-3">
                <DangerAction
                  trigger={running === "schedule" ? "예약 중…" : "예약 실행"}
                  title={`${definitionPreview.seasonId} 도감 연구 시즌 예약`}
                  description="검증한 정의 스냅샷을 미래 월 시즌으로 저장합니다. 기능 플래그는 변경하지 않습니다."
                  confirmText={`SCHEDULE ${definitionPreview.seasonId}`}
                  disabled={running !== null}
                  onConfirm={() => void scheduleDefinition()}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 p-5 dark:border-zinc-700">
          <div>
            <h4 className="text-base font-semibold">2. 최근 시즌 관측과 수동 작업</h4>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              최근 24개 시즌의 참가·최종 순위·트로피 상태입니다. 결산과 발급은 분리됩니다.
            </p>
          </div>
          <Button disabled={loading || running !== null} onClick={() => void load()}>
            {loading ? "조회 중…" : "상태 새로고침"}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-xs">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th className="px-4 py-3">시즌</th>
                <th className="px-4 py-3">기간·상태</th>
                <th className="px-4 py-3">진행</th>
                <th className="px-4 py-3">최종 등급</th>
                <th className="px-4 py-3">트로피</th>
                <th className="px-4 py-3">운영</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {(data?.seasons ?? []).map((season) => {
                const canSettle = season.opsState === "ready";
                const canResettle = season.status === "closed" &&
                  season.counts.trophies === 0;
                const canAward = season.status === "closed" &&
                  season.counts.finalRanked > 0;
                return (
                  <tr key={season.seasonId} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-mono text-sm font-semibold">{season.seasonId}</p>
                      <p className="mt-1 text-zinc-500">v{season.definitionVersion} · {season.themeName}</p>
                      {season.opsState === "inconsistent" ? (
                        <p className="mt-2 font-semibold text-red-700 dark:text-red-300">
                          정합성 확인 필요
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p>{STATUS_LABELS[season.status]} · {OPS_STATE_LABELS[season.opsState]}</p>
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">
                        {shortTimestamp(season.startAt)}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-500">
                        {shortTimestamp(season.endAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p>전체 {number(season.counts.progress)}</p>
                      <p>점수 있음 {number(season.counts.scored)}</p>
                      <p>최종 순위 {number(season.counts.finalRanked)}</p>
                    </td>
                    <td className="px-4 py-4">
                      {Object.entries(season.counts.finalTiers).map(([tier, count]) => (
                        <span key={tier} className="mr-2 inline-block whitespace-nowrap">
                          {TIER_LABELS[tier as TrophyTier]} {number(count)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold">{number(season.counts.trophies)}건</p>
                      <ConfirmationGuide seasonId={season.seasonId} />
                    </td>
                    <td className="px-4 py-4">
                      {!readOnly ? (
                        <div className="flex max-w-72 flex-wrap gap-2">
                          <Button
                            disabled={running !== null}
                            onClick={() => void previewSettlement(season.seasonId)}
                          >
                            {running === `preview:${season.seasonId}` ? "계산 중…" : "결산 미리보기"}
                          </Button>
                          {canSettle ? (
                            <DangerAction
                              trigger="결산 실행"
                              title={`${season.seasonId} 결산`}
                              description="현재 공식 적격 조건으로 최종 순위와 등급을 저장하고 시즌을 닫습니다."
                              confirmText={`SETTLE ${season.seasonId}`}
                              disabled={running !== null || !data?.features.settlementEnabled}
                              onConfirm={() => void runSeasonOperation("settle", season.seasonId)}
                            />
                          ) : null}
                          {canResettle ? (
                            <DangerAction
                              trigger="재결산 실행"
                              title={`${season.seasonId} 재결산`}
                              description="트로피가 한 건도 없는 닫힌 시즌의 최종 결과를 다시 계산합니다."
                              confirmText={`RESETTLE ${season.seasonId}`}
                              disabled={running !== null || !data?.features.settlementEnabled}
                              onConfirm={() => void runSeasonOperation("resettle", season.seasonId)}
                            />
                          ) : null}
                          {canAward ? (
                            <DangerAction
                              trigger="트로피 발급"
                              title={`${season.seasonId} 트로피 발급`}
                              description="확정된 최종 등급을 시즌 트로피 이력으로 공개합니다. 발급 뒤에는 재결산할 수 없습니다."
                              confirmText={`AWARD ${season.seasonId}`}
                              disabled={
                                running !== null ||
                                !data?.features.settlementEnabled ||
                                !data?.features.trophiesEnabled
                              }
                              onConfirm={() => void runSeasonOperation("award-trophies", season.seasonId)}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-zinc-500">상태 확인만 가능</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && (data?.seasons.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    예약된 도감 연구 시즌이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {settlementPreview ? (
        <div className={`${SURFACE_CARD} p-5`}>
          <h4 className="text-base font-semibold">
            3. {settlementPreview.seasonId} 결산 미리보기
          </h4>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            참가 {number(settlementPreview.participantCount)}명 · 등급 없음 {number(settlementPreview.untieredCount)}명
          </p>
          <div className={`${SURFACE_INSET} mt-4 overflow-x-auto p-3`}>
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="px-2 py-2">순위</th>
                  <th className="px-2 py-2">사용자 ID</th>
                  <th className="px-2 py-2">점수</th>
                  <th className="px-2 py-2">예상 등급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {settlementPreview.top.map((row) => (
                  <tr key={row.userId}>
                    <td className="px-2 py-2">{row.rank}</td>
                    <td className="px-2 py-2 font-mono">{row.userId}</td>
                    <td className="px-2 py-2">{number(row.score)}</td>
                    <td className="px-2 py-2">
                      {row.tier ? TIER_LABELS[row.tier] : "등급 없음"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
