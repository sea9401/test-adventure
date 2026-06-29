"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crown,
  DoorOpen,
  FirstAidKit,
  Skull,
  Sparkle,
  TreasureChest,
} from "@phosphor-icons/react";
import {
  GRID_DUNGEON_ENTRANCE,
  gridDungeonKey,
  type GridDungeonMoveDir,
  type GridDungeonPublicRun,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";

type GridDungeonState = {
  ok: boolean;
  entrance: typeof GRID_DUNGEON_ENTRANCE;
  atEntrance: boolean;
  run: GridDungeonPublicRun | null;
  error?: string;
};

const TILE_LABEL: Record<GridDungeonTileKind, string> = {
  start: "입구",
  empty: "복도",
  wall: "벽",
  monster: "경비병",
  elite: "수문장",
  treasure: "보물",
  fountain: "샘",
  boss: "파수꾼",
  exit: "출구",
};

const DIR_BUTTONS: Array<{
  dir: GridDungeonMoveDir;
  label: string;
  Icon: typeof ArrowUp;
}> = [
  { dir: "up", label: "위", Icon: ArrowUp },
  { dir: "left", label: "왼쪽", Icon: ArrowLeft },
  { dir: "right", label: "오른쪽", Icon: ArrowRight },
  { dir: "down", label: "아래", Icon: ArrowDown },
];

function tileIcon(kind: GridDungeonTileKind, visible: boolean) {
  if (!visible) return null;
  if (kind === "treasure") return <TreasureChest size={20} weight="fill" />;
  if (kind === "monster" || kind === "elite") return <Skull size={20} weight="fill" />;
  if (kind === "boss") return <Crown size={20} weight="fill" />;
  if (kind === "fountain") return <FirstAidKit size={20} weight="fill" />;
  if (kind === "exit") return <DoorOpen size={20} weight="fill" />;
  if (kind === "start") return <Sparkle size={20} weight="fill" />;
  return null;
}

export function V2GridDungeonView({
  onBackToMap,
  onRefreshGameState,
}: {
  onBackToMap: () => void;
  onRefreshGameState: () => void | Promise<void>;
}) {
  const [state, setState] = useState<GridDungeonState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/v2/grid-dungeon", { cache: "no-store" });
    const json = (await res.json()) as GridDungeonState;
    if (!res.ok || !json.ok) {
      setError(json.error ?? "던전 상태를 불러오지 못했습니다.");
      return;
    }
    setState(json);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/v2/grid-dungeon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as GridDungeonState;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "던전 요청에 실패했습니다.");
          return;
        }
        setState(json);
        if (body.action === "claim") await onRefreshGameState();
      } finally {
        setBusy(false);
      }
    },
    [onRefreshGameState],
  );

  const run = state?.run ?? null;
  const revealed = useMemo(() => new Set(run?.revealed ?? []), [run?.revealed]);
  const visited = useMemo(() => new Set(run?.visited ?? []), [run?.visited]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 text-zinc-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100">
            {GRID_DUNGEON_ENTRANCE.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            지도 ({GRID_DUNGEON_ENTRANCE.col}, {GRID_DUNGEON_ENTRANCE.row}) 입구에서
            진입하는 격자 탐험 던전
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToMap}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
        >
          지도로
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!state ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
          불러오는 중...
        </div>
      ) : !run || run.status === "claimed" || run.status === "failed" ? (
        <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-4">
          <div>
            <div className="text-sm font-semibold text-zinc-100">
              입구 상태
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {state.atEntrance
                ? "입구 앞에 서 있습니다. 바로 탐험을 시작할 수 있습니다."
                : "지도에서 입구 칸으로 이동해야 탐험을 시작할 수 있습니다."}
            </div>
          </div>
          <button
            type="button"
            disabled={!state.atEntrance || busy}
            onClick={() => postAction({ action: "start" })}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DoorOpen size={16} weight="fill" />
            탐험 시작
          </button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">체력</div>
              <div className="mt-1 text-base font-bold text-emerald-300">
                {run.hp} / 10
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">확보 골드</div>
              <div className="mt-1 text-base font-bold text-yellow-300">
                {run.pendingGold.toLocaleString()}G
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">상태</div>
              <div className="mt-1 text-base font-bold text-zinc-100">
                {run.status === "cleared" ? "정산 가능" : "탐험 중"}
              </div>
            </div>
          </section>

          <section className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="grid aspect-square w-full grid-cols-5 grid-rows-5 gap-1">
              {run.layout.flatMap((row, y) =>
                row.map((kind, x) => {
                  const key = gridDungeonKey(x, y);
                  const isCurrent = run.pos.x === x && run.pos.y === y;
                  const isRevealed = revealed.has(key);
                  const isVisited = visited.has(key);
                  const wall = isRevealed && kind === "wall";
                  return (
                    <div
                      key={key}
                      title={isRevealed ? TILE_LABEL[kind] : "미탐험"}
                      className={`relative flex min-h-0 min-w-0 items-center justify-center rounded border text-[10px] transition ${
                        isCurrent
                          ? "border-emerald-300 bg-emerald-900/70 text-emerald-100"
                          : wall
                            ? "border-zinc-900 bg-zinc-950 text-zinc-700"
                            : isRevealed
                              ? "border-zinc-700 bg-zinc-900 text-zinc-300"
                              : "border-zinc-900 bg-black text-zinc-800"
                      }`}
                    >
                      {isCurrent ? (
                        <span className="h-3 w-3 rounded-full bg-emerald-300" />
                      ) : (
                        tileIcon(kind, isRevealed)
                      )}
                      {isVisited && !isCurrent && (
                        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-zinc-500" />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm text-zinc-200">{run.lastMessage}</div>
            {run.status === "cleared" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => postAction({ action: "claim" })}
                className="rounded-md bg-yellow-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-yellow-400 disabled:opacity-40"
              >
                {run.pendingGold.toLocaleString()}G 정산
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {DIR_BUTTONS.map(({ dir, label, Icon }) => (
                  <button
                    key={dir}
                    type="button"
                    disabled={busy}
                    onClick={() => postAction({ action: "move", dir })}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                  >
                    <Icon size={15} weight="bold" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
