"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Field";

// 읽기 전용 밸런스 텔레메트리(Phase 1) — /api/admin/balance-telemetry 집계 표시.
//   최근 밸런스 변경(난이도 곡선·아이템 정리·DEX 독주·SPI 부활) 실측 검증용.

type Bucket = { label: string; players: number; avgPower: number };
type Telemetry = {
  summary: {
    players: number;
    adminExcluded: number;
    deriveFailed: number;
    avgPower: number;
    medianPower: number;
    maxFrontierDepth: number;
  };
  depthBands: Bucket[];
  levelBands: Bucket[];
  powerBands: { label: string; players: number }[];
  classDist: { key: string; label: string; count: number }[];
  tierDist: { tier: number; count: number }[];
  jobDist: { key: string; label: string; tier: number; count: number }[];
  jobTierDist: { tier: number; count: number }[];
  masteryBands: { label: string; players: number }[];
  reincarnationBands: { label: string; players: number }[];
  spPressureBands: { label: string; players: number }[];
  statAxes: { key: string; label: string; avg: number; dominantCount: number }[];
  economy: {
    label: string;
    players: number;
    avgGold: number;
    medianGold: number;
    maxGold: number;
  }[];
  equipmentUsage: { id: string; name: string; count: number }[];
  equipmentSummary: {
    label: string;
    players: number;
    avgEquipped: number;
    avgOwned: number;
    avgMaxEnhance: number;
  }[];
  lifeProgress: {
    fishingPlayers: number;
    avgFishCaught: number;
    avgFishSpecies: number;
    treasurePlayers: number;
    avgAntiquesFound: number;
  };
  workshopEconomy: {
    summary: {
      activeBlacksmiths: number;
      avgBlacksmithLevel: number;
      totalCrafts: number;
      qualityCrafts: number;
      masterworkCrafts: number;
      craftOnlyCrafts: number;
      maxHighestTier: number;
      deliveryClaimsToday: number;
      bestQualityBasic: number;
      bestQualityStar: number;
      bestQualityDoubleStar: number;
      qualityCraftRatePct: number;
      masterworkCraftRatePct: number;
      craftOnlyCraftRatePct: number;
      avgCraftsPerActiveBlacksmith: number;
      avgMaterialsPerActiveBlacksmith: number;
      materialStockPerCraft: number;
    };
    levelBands: {
      label: string;
      players: number;
      avgBlacksmithLevel: number;
      totalCrafts: number;
      masterworkCrafts: number;
      craftOnlyCrafts: number;
    }[];
    materials: {
      id: string;
      name: string;
      total: number;
      holders: number;
      avgPerHolder: number;
    }[];
  };
};

function Card({
  title,
  children,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

// 가로 막대 행 — label, 막대(비율), 우측 수치.
function BarRow({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <div className="w-40 shrink-0 truncate text-zinc-600 dark:text-zinc-300">
        {label}
      </div>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded bg-indigo-500/70 dark:bg-indigo-400/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
        {value.toLocaleString()}
        {suffix ?? ""}
      </div>
    </div>
  );
}

function WorkshopEconomySignal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "watch" | "risk";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
      : tone === "watch"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200";
  return (
    <div className={`rounded border px-2 py-1.5 text-xs ${cls}`}>
      <div className="text-[10px] opacity-75">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function BalanceTelemetryTab() {
  const [data, setData] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/balance-telemetry")
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<Telemetry>;
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(load 가 state 시드)
    load();
  }, [load]);

  const depthMax = Math.max(1, ...(data?.depthBands ?? []).map((b) => b.players));
  const levelMax = Math.max(1, ...(data?.levelBands ?? []).map((b) => b.players));
  const powerMax = Math.max(1, ...(data?.powerBands ?? []).map((b) => b.players));
  const statAvgMax = Math.max(1, ...(data?.statAxes ?? []).map((s) => s.avg));
  const domMax = Math.max(
    1,
    ...(data?.statAxes ?? []).map((s) => s.dominantCount),
  );
  const classMax = Math.max(1, ...(data?.classDist ?? []).map((c) => c.count));
  const jobMax = Math.max(1, ...(data?.jobDist ?? []).map((c) => c.count));
  const masteryMax = Math.max(
    1,
    ...(data?.masteryBands ?? []).map((b) => b.players),
  );
  const reincarnationMax = Math.max(
    1,
    ...(data?.reincarnationBands ?? []).map((b) => b.players),
  );
  const spPressureMax = Math.max(
    1,
    ...(data?.spPressureBands ?? []).map((b) => b.players),
  );
  const equipMax = Math.max(
    1,
    ...(data?.equipmentUsage ?? []).map((e) => e.count),
  );
  const workshopMaterialMax = Math.max(
    1,
    ...(data?.workshopEconomy.materials ?? []).map((m) => m.total),
  );
  const workshopSummary = data?.workshopEconomy.summary;
  const materialStockTone =
    !workshopSummary || workshopSummary.totalCrafts === 0
      ? "watch"
      : workshopSummary.materialStockPerCraft < 1
        ? "risk"
        : workshopSummary.materialStockPerCraft < 3
          ? "watch"
          : "ok";
  const qualityTone =
    !workshopSummary || workshopSummary.totalCrafts < 10
      ? "watch"
      : workshopSummary.qualityCraftRatePct < 15
        ? "risk"
        : workshopSummary.qualityCraftRatePct > 55
          ? "watch"
          : "ok";
  const deliveryTone =
    !workshopSummary || workshopSummary.activeBlacksmiths === 0
      ? "watch"
      : workshopSummary.deliveryClaimsToday === 0
        ? "risk"
        : workshopSummary.deliveryClaimsToday <
            Math.ceil(workshopSummary.activeBlacksmiths * 0.2)
          ? "watch"
          : "ok";

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">밸런스 텔레메트리</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              읽기 전용 — 현재 v2 세이브 집계(관리자 계정 제외). 프론티어·직업 숙련도·SP·장비·생활 진행 실측용.
            </p>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "로딩…" : "새로고침"}
          </Button>
        </div>
        {error ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}
        {data ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {[
              { label: "플레이어", value: data.summary.players },
              { label: "평균 전투력", value: data.summary.avgPower },
              { label: "중앙 전투력", value: data.summary.medianPower },
              { label: "관리자 제외", value: data.summary.adminExcluded },
              { label: "파생 실패", value: data.summary.deriveFailed },
              { label: "최대 깊이", value: data.summary.maxFrontierDepth },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {k.label}
                </div>
                <div className="font-mono text-base tabular-nums">
                  {k.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card
            title="깊이 분포 (프론티어 도달)"
            hint="난이도 곡선·프론티어 캡 검증 — 정체 구간·진척. 막대=인원, 우측=평균 전투력."
          >
            {data.depthBands.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={b.players}
                max={depthMax}
                suffix={b.avgPower ? ` · ⚔${b.avgPower}` : ""}
              />
            ))}
          </Card>

          <Card
            title="현재 직업 분포"
            hint="새 직업 카탈로그 기준 jobId. 상위 20개만 표시합니다."
          >
            {data.jobDist.map((j) => (
              <BarRow
                key={j.key}
                label={`${j.label} (T${j.tier})`}
                value={j.count}
                max={jobMax}
                suffix="명"
              />
            ))}
            <div className="mt-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              티어:{" "}
              {data.jobTierDist.map((t) => `T${t.tier} ${t.count}`).join(" · ") ||
                "없음"}
            </div>
          </Card>

          <Card
            title="현재 직업 숙련도 구간"
            hint="전직 게이트와 직접 맞물리는 현재 jobCumLevel/cumLevel 기준입니다."
          >
            {data.masteryBands.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={b.players}
                max={masteryMax}
                suffix="명"
              />
            ))}
          </Card>

          <Card title="환생 / SP 압박">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  환생 횟수
                </div>
                {data.reincarnationBands.map((b) => (
                  <BarRow
                    key={b.label}
                    label={b.label}
                    value={b.players}
                    max={reincarnationMax}
                    suffix="명"
                  />
                ))}
              </div>
              <div>
                <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  장착 SP / 예산
                </div>
                {data.spPressureBands.map((b) => (
                  <BarRow
                    key={b.label}
                    label={b.label}
                    value={b.players}
                    max={spPressureMax}
                    suffix="명"
                  />
                ))}
              </div>
            </div>
          </Card>

          <Card
            title="유효 스탯 축 (장비·패시브 포함)"
            hint="DEX 독주·SPI 부활 실측 — 평균 유효 스탯. 지배=그 축이 최대인 플레이어 수."
          >
            {data.statAxes.map((s) => (
              <BarRow
                key={s.key}
                label={`${s.label} (지배 ${s.dominantCount}명)`}
                value={s.avg}
                max={statAvgMax}
              />
            ))}
            <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <div className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                지배 스탯 분포 (argmax)
              </div>
              {data.statAxes
                .filter((s) => s.dominantCount > 0)
                .sort((a, b) => b.dominantCount - a.dominantCount)
                .map((s) => (
                  <BarRow
                    key={`dom-${s.key}`}
                    label={s.label}
                    value={s.dominantCount}
                    max={domMax}
                    suffix="명"
                  />
                ))}
            </div>
          </Card>

          <Card title="전투력 분포">
            {data.powerBands.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={b.players}
                max={powerMax}
                suffix="명"
              />
            ))}
          </Card>

          <Card title="레벨 분포" hint="막대=인원, 우측=평균 전투력.">
            {data.levelBands.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={b.players}
                max={levelMax}
                suffix={b.avgPower ? ` · ⚔${b.avgPower}` : ""}
              />
            ))}
          </Card>

          <Card title="직군 분포">
            {data.classDist.map((c) => (
              <BarRow
                key={c.key}
                label={c.label}
                value={c.count}
                max={classMax}
                suffix="명"
              />
            ))}
            <div className="mt-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              파생 classTier:{" "}
              {data.tierDist.map((t) => `${t.tier} ${t.count}`).join(" · ") ||
                "없음"}
            </div>
          </Card>

          <Card
            title="장비 사용률 (장착 상위 20)"
            hint="아이템 정리 효과 — 실제 장착되는 장비."
          >
            {data.equipmentUsage.length ? (
              data.equipmentUsage.map((e) => (
                <BarRow
                  key={e.id}
                  label={e.name}
                  value={e.count}
                  max={equipMax}
                  suffix="명"
                />
              ))
            ) : (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                장착 데이터 없음
              </div>
            )}
          </Card>

          <Card
            title="장비 보유/강화 — 레벨대별"
            hint="avg equipped / owned / max +강화."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">레벨대</th>
                    <th className="py-1 pr-2 text-right font-medium">인원</th>
                    <th className="py-1 pr-2 text-right font-medium">장착</th>
                    <th className="py-1 pr-2 text-right font-medium">보유</th>
                    <th className="py-1 text-right font-medium">최고 강화</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {data.equipmentSummary.map((e) => (
                    <tr
                      key={e.label}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2 font-sans">{e.label}</td>
                      <td className="py-1 pr-2 text-right">{e.players}</td>
                      <td className="py-1 pr-2 text-right">{e.avgEquipped}</td>
                      <td className="py-1 pr-2 text-right">{e.avgOwned}</td>
                      <td className="py-1 text-right">+{e.avgMaxEnhance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="생활 콘텐츠 진행">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
              {[
                { label: "낚시 참여", value: data.lifeProgress.fishingPlayers },
                { label: "평균 어획", value: data.lifeProgress.avgFishCaught },
                { label: "평균 어종", value: data.lifeProgress.avgFishSpecies },
                { label: "발굴 참여", value: data.lifeProgress.treasurePlayers },
                { label: "평균 유물", value: data.lifeProgress.avgAntiquesFound },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {item.label}
                  </div>
                  <div className="font-mono text-sm tabular-nums">
                    {item.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="경제 — 레벨대별 골드"
            hint="골드=HP 회복 통화. avg / 중앙 / 최대."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">레벨대</th>
                    <th className="py-1 pr-2 text-right font-medium">인원</th>
                    <th className="py-1 pr-2 text-right font-medium">평균</th>
                    <th className="py-1 pr-2 text-right font-medium">중앙</th>
                    <th className="py-1 text-right font-medium">최대</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {data.economy.map((e) => (
                    <tr
                      key={e.label}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2 font-sans">{e.label}</td>
                      <td className="py-1 pr-2 text-right">{e.players}</td>
                      <td className="py-1 pr-2 text-right">
                        {e.avgGold.toLocaleString()}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {e.medianGold.toLocaleString()}
                      </td>
                      <td className="py-1 text-right">
                        {e.maxGold.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="대장간 경제"
            hint="현재 세이브 스냅샷 기준 누적 제작, 일일 납품 진행, 제작 재료 재고입니다."
          >
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {[
                {
                  label: "참여 대장장이",
                  value: data.workshopEconomy.summary.activeBlacksmiths,
                },
                {
                  label: "평균 대장장이 Lv",
                  value: data.workshopEconomy.summary.avgBlacksmithLevel,
                },
                {
                  label: "누적 제작",
                  value: data.workshopEconomy.summary.totalCrafts,
                },
                {
                  label: "품질 제작",
                  value: data.workshopEconomy.summary.qualityCrafts,
                },
                {
                  label: "명장 제작",
                  value: data.workshopEconomy.summary.masterworkCrafts,
                },
                {
                  label: "전용 제작",
                  value: data.workshopEconomy.summary.craftOnlyCrafts,
                },
                {
                  label: "최고 티어",
                  value: data.workshopEconomy.summary.maxHighestTier,
                },
                {
                  label: "오늘 납품 수령",
                  value: data.workshopEconomy.summary.deliveryClaimsToday,
                },
                {
                  label: "품질 제작률",
                  value: data.workshopEconomy.summary.qualityCraftRatePct,
                  suffix: "%",
                },
                {
                  label: "명장 제작률",
                  value: data.workshopEconomy.summary.masterworkCraftRatePct,
                  suffix: "%",
                },
                {
                  label: "전용 제작률",
                  value: data.workshopEconomy.summary.craftOnlyCraftRatePct,
                  suffix: "%",
                },
                {
                  label: "재료/제작",
                  value: data.workshopEconomy.summary.materialStockPerCraft,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {item.label}
                  </div>
                  <div className="font-mono text-sm tabular-nums">
                    {item.value.toLocaleString()}
                    {"suffix" in item ? item.suffix : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <WorkshopEconomySignal
                label="재료 수급"
                value={
                  materialStockTone === "ok"
                    ? "여유"
                    : materialStockTone === "watch"
                      ? "관찰"
                      : "부족 위험"
                }
                tone={materialStockTone}
              />
              <WorkshopEconomySignal
                label="품질 제작률"
                value={
                  qualityTone === "ok"
                    ? "정상"
                    : qualityTone === "watch"
                      ? "편차 관찰"
                      : "낮음"
                }
                tone={qualityTone}
              />
              <WorkshopEconomySignal
                label="납품 이용"
                value={
                  deliveryTone === "ok"
                    ? "이용 중"
                    : deliveryTone === "watch"
                      ? "낮음"
                      : "미사용"
                }
                tone={deliveryTone}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              기준: 재료/제작 1 미만은 수급 부족 위험, 품질 제작률 15% 미만은
              품질 체감 부족, 활성 대장장이 대비 납품 수령이 낮으면 납품 보상
              또는 접근성을 점검합니다.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  제작 재료 재고
                </div>
                {data.workshopEconomy.materials.map((m) => (
                  <BarRow
                    key={m.id}
                    label={`${m.name} (${m.holders}명)`}
                    value={m.total}
                    max={workshopMaterialMax}
                    suffix={m.avgPerHolder ? ` · 평균 ${m.avgPerHolder}` : ""}
                  />
                ))}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  품질 최고 기록
                </div>
                {[
                  ["기본", data.workshopEconomy.summary.bestQualityBasic],
                  ["★", data.workshopEconomy.summary.bestQualityStar],
                  ["★★", data.workshopEconomy.summary.bestQualityDoubleStar],
                ].map(([label, count]) => (
                  <BarRow
                    key={label}
                    label={String(label)}
                    value={Number(count)}
                    max={Math.max(
                      1,
                      data.workshopEconomy.summary.bestQualityBasic,
                      data.workshopEconomy.summary.bestQualityStar,
                      data.workshopEconomy.summary.bestQualityDoubleStar,
                    )}
                    suffix="명"
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">레벨대</th>
                    <th className="py-1 pr-2 text-right font-medium">인원</th>
                    <th className="py-1 pr-2 text-right font-medium">평균 Lv</th>
                    <th className="py-1 pr-2 text-right font-medium">제작</th>
                    <th className="py-1 pr-2 text-right font-medium">명장</th>
                    <th className="py-1 text-right font-medium">전용</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {data.workshopEconomy.levelBands.map((b) => (
                    <tr
                      key={b.label}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2 font-sans">{b.label}</td>
                      <td className="py-1 pr-2 text-right">{b.players}</td>
                      <td className="py-1 pr-2 text-right">
                        {b.avgBlacksmithLevel}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {b.totalCrafts.toLocaleString()}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {b.masterworkCrafts.toLocaleString()}
                      </td>
                      <td className="py-1 text-right">
                        {b.craftOnlyCrafts.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
