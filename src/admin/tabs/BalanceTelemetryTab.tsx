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
  statAxes: { key: string; label: string; avg: number; dominantCount: number }[];
  economy: {
    label: string;
    players: number;
    avgGold: number;
    medianGold: number;
    maxGold: number;
  }[];
  equipmentUsage: { id: string; name: string; count: number }[];
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
  const equipMax = Math.max(
    1,
    ...(data?.equipmentUsage ?? []).map((e) => e.count),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">밸런스 텔레메트리</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              읽기 전용 — 기존 세이브 집계(관리자 계정 제외). 최근 밸런스 변경
              실측용.
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

          <Card title="직업 분포">
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
              차수:{" "}
              {data.tierDist.map((t) => `${t.tier}차 ${t.count}`).join(" · ") ||
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
        </div>
      ) : null}
    </div>
  );
}
