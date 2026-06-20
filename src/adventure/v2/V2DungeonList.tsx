"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  depthName,
  dungeonThemeGroups,
  themeElementSummary,
  MAX_FRONTIER_DEPTH,
} from "@/adventure/data/v2/dungeon";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import {
  RARE_MAP_KINDS,
  type RareMapInstance,
} from "@/adventure/data/v2/rareMaps";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";

// 프론티어 사냥터 목록 — 2단. 테마(들판·마른 협곡·…) 카드 → 누르면 그 안에서 깊이 카드 6개.
// 뒤로 갈수록 깊이가 한 화면에 너무 많아지는 걸 테마별로 접어 해소. frontierDepth = 최고 도달
// 깊이(기본 2). 그 이상은 "도전(미정복)" 구역(= maxDepth+1). 단 MAX_FRONTIER_DEPTH(마지막 테마 끝)에서 캡.

export function V2DungeonList({
  currentOutpost,
  onSelectFloor,
  onOpenMap,
  frontierDepth = 2,
  onSelectRareMap,
}: {
  currentOutpost: { id: string; name: string } | null;
  onSelectFloor: (depth: number) => void;
  onOpenMap: () => void;
  frontierDepth?: number;
  // 레어맵 입장 — 보유 지도(iid·깊이)로 농축 사냥. 미전달이면 섹션 숨김.
  onSelectRareMap?: (map: RareMapInstance) => void;
}) {
  const maxDepth = Math.max(2, frontierDepth);
  // 도전(미정복) = 최고도달+1, 단 마지막 테마 끝(MAX_FRONTIER_DEPTH)에서 캡(그 너머 콘텐츠 없음).
  const challengeDepth = Math.min(maxDepth + 1, MAX_FRONTIER_DEPTH);
  // 깊이 1 ~ 도전까지를 테마 블록(≤6깊이)으로 묶는다.
  const groups = dungeonThemeGroups(challengeDepth);
  // 열린 테마 — 블록의 첫 깊이로 식별(배열 인덱스보다 안정적, frontierDepth 변동에도 견고).
  const [openDepth, setOpenDepth] = useState<number | null>(null);
  const openGroup =
    openDepth != null
      ? (groups.find((g) => g.depths[0] === openDepth) ?? null)
      : null;

  // 보유 레어맵 — 마운트 1회 조회(소모/만료는 입장 후 서버 권위).
  const [rareMaps, setRareMaps] = useState<RareMapInstance[]>([]);
  // 만료 표기 기준 시각 — render 중 Date.now() 직접 호출 회피(fetch 시점 고정).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!onSelectRareMap) return;
    let alive = true;
    fetch("/api/v2/me/rare-maps")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rareMaps?: RareMapInstance[] } | null) => {
        if (alive && j?.ok) {
          // hunt 계열만 — 유틸맵(비밀 상점/개명/화공)은 인벤토리 소모품 탭에서 사용.
          setRareMaps(
            (j.rareMaps ?? []).filter(
              (m) => RARE_MAP_KINDS[m.kind]?.category === "hunt",
            ),
          );
          setNowMs(Date.now());
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [onSelectRareMap]);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={openGroup ? openGroup.name : "사냥터"}
        onBack={openGroup ? () => setOpenDepth(null) : onOpenMap}
      />
      {!currentOutpost && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          거점에 머문 적이 없어요. 지도에서 거점 진입 후 사냥 가능.
        </p>
      )}

      {!currentOutpost ? (
        <Card padding="md">
          <button
            type="button"
            onClick={onOpenMap}
            className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            지도 열기
          </button>
        </Card>
      ) : openGroup ? (
        // 이너 — 선택한 테마의 깊이 카드 6개.
        <div className="space-y-3">
          <ThemeElementLine depth={openGroup.depths[0]} />
          <div className="grid grid-cols-2 gap-2">
            {openGroup.depths.map((depth) => (
              <DepthCard
                key={depth}
                depth={depth}
                isChallenge={depth === challengeDepth}
                onSelect={onSelectFloor}
              />
            ))}
          </div>
        </div>
      ) : (
        // 테마(사냥터) 카드 (+위에 보유 레어맵 섹션).
        <div className="space-y-3">
          {onSelectRareMap && rareMaps.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                발견한 지도
              </div>
              {rareMaps.map((m) => (
                <button
                  key={m.iid}
                  type="button"
                  onClick={() => onSelectRareMap(m)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-left hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-950/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-sky-800 dark:text-sky-200">
                      🗺 {RARE_MAP_KINDS[m.kind]?.name ?? m.kind} — 깊이{" "}
                      {m.depth}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-sky-700/80 dark:text-sky-400/80">
                      남은 {m.runsLeft}판 · {fmtExpiry(m.expiresAt, nowMs)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">
                    입장
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
          {groups.map((g) => {
            const hasChallenge = g.depths.includes(challengeDepth);
            const from = g.depths[0];
            const to = g.depths[g.depths.length - 1];
            return (
              <button
                key={from}
                type="button"
                onClick={() => setOpenDepth(from)}
                className="group block h-full text-left"
              >
                <Card
                  padding="sm"
                  className={`flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
                    hasChallenge
                      ? "border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-400"
                      : "hover:border-rose-300 dark:hover:border-rose-600"
                  }`}
                >
                  <div
                    className={`truncate text-sm font-medium transition-colors ${
                      hasChallenge
                        ? "text-amber-700 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300"
                        : "group-hover:text-rose-600 dark:group-hover:text-rose-400"
                    }`}
                  >
                    {g.name}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {from === to ? `깊이 ${from}` : `깊이 ${from}~${to}`}
                  </div>
                  <ThemeElementLine depth={from} compact />
                  {hasChallenge && (
                    <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      도전 구역 포함
                    </div>
                  )}
                  <span
                    className={`mt-2 self-start rounded px-2 py-0.5 text-xs transition-colors ${
                      hasChallenge
                        ? "bg-amber-100 text-amber-800 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-900 dark:text-amber-100 dark:group-hover:bg-amber-600"
                        : "bg-zinc-200 text-zinc-700 group-hover:bg-rose-500 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-rose-600"
                    }`}
                  >
                    열기
                  </span>
                </Card>
              </button>
            );
          })}
          </div>
        </div>
      )}
    </main>
  );
}

// 깊이 1개 카드 — 입장. (이너 뷰에서 테마의 각 깊이.)
function DepthCard({
  depth,
  isChallenge,
  onSelect,
}: {
  depth: number;
  isChallenge: boolean;
  onSelect: (depth: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(depth)}
      className="group block h-full text-left"
    >
      <Card
        padding="sm"
        className={`flex h-full flex-col transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm ${
          isChallenge
            ? "border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-400"
            : "hover:border-rose-300 dark:hover:border-rose-600"
        }`}
      >
        <div
          className={`truncate text-sm font-medium transition-colors ${
            isChallenge
              ? "text-amber-700 dark:text-amber-400 group-hover:text-amber-800 dark:group-hover:text-amber-300"
              : "group-hover:text-rose-600 dark:group-hover:text-rose-400"
          }`}
        >
          {depthName(depth)}
        </div>
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          권장 전투력 {floorPowerGate(depth)}
        </div>
        {isChallenge && (
          <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            도전 (미정복)
          </div>
        )}
        <span
          className={`mt-2 self-start rounded px-2 py-0.5 text-xs transition-colors ${
            isChallenge
              ? "bg-amber-100 text-amber-800 group-hover:bg-amber-500 group-hover:text-white dark:bg-amber-900 dark:text-amber-100 dark:group-hover:bg-amber-600"
              : "bg-zinc-200 text-zinc-700 group-hover:bg-rose-500 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-rose-600"
          }`}
        >
          입장
        </span>
      </Card>
    </button>
  );
}

// 테마 속성 요약 한 줄 — 등장 속성 + 추천 속성(최빈 몹 속성을 찌르는 픽, 있을 때만).
// 약점찌르기 +25% 가 "이 사냥터엔 어떤 속성을 들고 갈까"가 되도록 노출.
function ThemeElementLine({
  depth,
  compact,
}: {
  depth: number;
  compact?: boolean;
}) {
  const { elements, recommended } = themeElementSummary(depth);
  if (elements.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 ${
        compact ? "mt-1" : ""
      }`}
    >
      <span>속성 {elements.map((e) => V2_ELEMENT_LABEL[e]).join("·")}</span>
      {recommended && (
        <span className="rounded bg-emerald-500/15 px-1.5 py-px font-medium text-emerald-700 dark:text-emerald-400">
          추천 {V2_ELEMENT_LABEL[recommended]}
        </span>
      )}
    </div>
  );
}

// 만료까지 남은 시간 — 시간 단위 대략 표기(분 단위 정밀 불요).
function fmtExpiry(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (ms <= 0) return "만료됨";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "1시간 안에 만료";
  return `${h}시간 후 만료`;
}
