"use client";

import { useState } from "react";
import { Button, TextInput } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";
// 응답 타입은 서버 집계 모듈이 단일 소스 — 필드 추가/개명 시 클라 드리프트를 컴파일이 잡는다.
// (type-only import 라 서버 코드가 클라 번들에 끌려오지 않는다.)
import type { BalanceTelemetry } from "@/app/api/admin/balance-telemetry/aggregate";

// 읽기 전용 밸런스 텔레메트리(Phase 1) — /api/admin/balance-telemetry 집계 표시.
//   최근 밸런스 변경(난이도 곡선·아이템 정리·DEX 독주·SPI 부활) 실측 검증용.

type Telemetry = BalanceTelemetry;

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

function formatLastSeen(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return new Date(iso).toLocaleString("ko-KR");
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
  const [activeHours, setActiveHours] = useState("24");
  const [selectedUsers, setSelectedUsers] = useState("");
  const { data, loading, error, refetch } = useAsyncData<Telemetry>(
    (signal) => {
      const params = new URLSearchParams();
      const hours = Number(activeHours);
      if (Number.isFinite(hours) && hours > 0) {
        params.set("activeHours", String(hours));
      }
      const users = selectedUsers.trim();
      if (users) params.set("users", users);
      const qs = params.toString();
      return fetch(`/api/admin/balance-telemetry${qs ? `?${qs}` : ""}`, { signal }).then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<Telemetry>;
      });
    },
    [activeHours, selectedUsers],
  );

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">밸런스 텔레메트리</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              읽기 전용 — 현재 게임 데이터 집계(관리자 계정 제외). 최근 접속자/선택 유저 단위로 볼 수 있습니다.
            </p>
          </div>
          <Button onClick={refetch} disabled={loading}>
            {loading ? "로딩…" : "새로고침"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]">
          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              액티브 기준
            </span>
            <div className="mt-1 flex items-center gap-2">
              <TextInput
                value={activeHours}
                onChange={setActiveHours}
                placeholder="24"
                className="font-mono"
              />
              <span className="shrink-0 text-xs text-zinc-500">시간</span>
            </div>
            <span className="mt-1 block text-[11px] text-zinc-500">
              비우거나 0이면 전체 유저를 집계합니다.
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              선택 유저
            </span>
            <textarea
              value={selectedUsers}
              onChange={(e) => setSelectedUsers(e.target.value)}
              placeholder="정확한 닉네임, 이메일, 유저 ID를 쉼표나 줄바꿈으로 입력"
              className="mt-1 min-h-16 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              입력하면 정확히 일치하는 유저만 집계합니다. 액티브 기준도 함께 적용됩니다.
            </span>
          </label>
        </div>
        {error ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}
        {data?.filters?.unmatchedUserTokens.length ? (
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            매칭되지 않은 선택 유저:{" "}
            {data.filters.unmatchedUserTokens.join(", ")}
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
            title="골드 요약"
            hint="현재 보유량 기준입니다. 수급량 원장은 아직 없어서 지갑+은행 합산 보유 골드를 봅니다."
          >
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {[
                { label: "대상 유저", value: data.goldSummary.players },
                { label: "평균 지갑", value: data.goldSummary.avgWalletGold },
                { label: "평균 은행", value: data.goldSummary.avgBankGold },
                { label: "평균 합계", value: data.goldSummary.avgTotalGold },
                { label: "중앙 합계", value: data.goldSummary.medianTotalGold },
                { label: "최대 합계", value: data.goldSummary.maxTotalGold },
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
            title="유저별 골드"
            hint="상위 200명까지 표시합니다. 선택 유저를 입력하면 그 대상만 나옵니다."
          >
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">유저</th>
                    <th className="py-1 pr-2 text-right font-medium">Lv</th>
                    <th className="py-1 pr-2 text-right font-medium">지갑</th>
                    <th className="py-1 pr-2 text-right font-medium">은행</th>
                    <th className="py-1 pr-2 text-right font-medium">합계</th>
                    <th className="py-1 text-right font-medium">접속</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.goldUsers.length ? (
                    data.goldUsers.map((u) => (
                      <tr
                        key={u.userId}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="max-w-44 py-1 pr-2">
                          <div className="truncate font-medium">
                            {u.name ?? "(이름 없음)"}
                          </div>
                          <div className="truncate font-mono text-[10px] text-zinc-500">
                            {u.email ?? u.userId}
                          </div>
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {u.level}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {u.walletGold.toLocaleString()}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono">
                          {u.bankedGold.toLocaleString()}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono font-semibold">
                          {u.totalGold.toLocaleString()}
                        </td>
                        <td className="py-1 text-right text-[11px] text-zinc-500">
                          {formatLastSeen(u.lastSeenAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="border-t border-zinc-100 py-3 text-center text-zinc-500 dark:border-zinc-800"
                      >
                        대상 유저 없음
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

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
            hint="게임 내 직업 이름 기준입니다. 상위 20개만 표시합니다."
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
              직군 티어:{" "}
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
            hint="평균 장착 수 / 보유 수 / 최고 강화 단계."
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
