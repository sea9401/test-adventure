"use client";

import {
  WINTER_LAP_COINS,
  WINTER_TILES,
  winterTileCell,
  type WinterBoardView,
  type WinterRollEvent,
  type WinterRollResult,
  type WinterTile,
} from "@/adventure/data/v2/winterBoard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { useWinterBoard, type WinterBoardBusy } from "./useWinterBoard";

const dayFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/** 종료 시각(다음 날 0시) 직전의 날짜. 예: 12월 10일. */
function lastDayLabel(endsAt: number): string {
  return dayFormat.format(endsAt - 1);
}

function tileLabel(tile: WinterTile): string {
  switch (tile.kind) {
    case "start":
      return "출발";
    case "coins":
      return `주화 ${tile.coins}`;
    case "potion":
      return "회복약";
    case "again":
      return "한 번 더";
    case "forward":
      return `앞으로 ${tile.steps}칸`;
  }
}

function gains(result: Pick<WinterRollResult, "coins" | "potions" | "lapsGained">): string[] {
  return [
    result.coins > 0 ? `주화 +${result.coins}` : "",
    result.potions > 0 ? `회복약 +${result.potions}` : "",
    result.lapsGained > 0 ? `${result.lapsGained}바퀴 완주` : "",
  ].filter(Boolean);
}

function rollEventText(event: WinterRollEvent): string {
  const landed = `주사위 ${event.die} → ${event.landed}번 ${tileLabel(WINTER_TILES[event.landed]!)}`;
  const moved =
    event.to !== event.landed
      ? ` → ${event.to}번 ${tileLabel(WINTER_TILES[event.to]!)}`
      : "";
  const extra = [
    ...gains(event),
    event.diceRefund > 0 ? "주사위 1개 돌려받음" : "",
  ].filter(Boolean);
  return `${landed}${moved}${extra.length > 0 ? ` · ${extra.join(" · ")}` : ""}`;
}

function resultSummary(result: WinterRollResult): string {
  if (result.events.length === 1) return rollEventText(result.events[0]!);
  const parts = gains(result);
  return [`${result.events.length}번 굴림`, ...parts].join(" · ");
}

export function WinterBoardContent({
  view,
  busy,
  lastResult,
  onRoll,
  onRollAll,
  onClaim,
  onBuy,
}: {
  view: WinterBoardView;
  busy: WinterBoardBusy;
  lastResult: WinterRollResult | null;
  onRoll: () => void;
  onRollAll: () => void;
  onClaim: (laps: number) => void;
  onBuy: (itemId: string) => void;
}) {
  const rolling = view.phase === "active";
  const rollingEnds = lastDayLabel(view.rollingEndsAt);
  const shopEnds = lastDayLabel(view.shopEndsAt);
  const anyBusy = busy !== null;

  return (
    <>
      <Card padding="md" className="space-y-3">
        <SectionHeading title="겨울 말판" />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {rolling
            ? `주사위 굴리기는 ${rollingEnds}까지, 바퀴 보상과 교환소는 ${shopEnds}까지입니다.`
            : `주사위 굴리기는 ${rollingEnds}에 끝났습니다. 바퀴 보상과 교환소는 ${shopEnds}까지 이용할 수 있습니다.`}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm font-semibold tabular-nums">
          <div className={`${SURFACE_INSET} rounded-lg px-2 py-2`}>
            <dt className="sr-only">보유 주사위</dt>
            <dd>주사위 {view.dice.toLocaleString("ko-KR")}개</dd>
          </div>
          <div className={`${SURFACE_INSET} rounded-lg px-2 py-2 text-amber-700 dark:text-amber-300`}>
            <dt className="sr-only">보유 겨울 주화</dt>
            <dd>주화 {view.coins.toLocaleString("ko-KR")}개</dd>
          </div>
          <div className={`${SURFACE_INSET} rounded-lg px-2 py-2`}>
            <dt className="sr-only">돈 바퀴 수</dt>
            <dd>{view.laps.toLocaleString("ko-KR")}바퀴</dd>
          </div>
        </dl>
      </Card>

      <Card padding="sm">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1.5">
          <ol aria-label="겨울 말판" className="contents">
            {WINTER_TILES.map((tile, index) => {
              const cell = winterTileCell(index);
              const current = index === view.position;
              return (
                <li
                  key={index}
                  aria-current={current ? "true" : undefined}
                  style={{ gridColumn: cell.col, gridRow: cell.row }}
                  className={`${current ? `${SURFACE_ACCENT} ring-2 ring-selected-line` : SURFACE_INSET} flex min-h-14 flex-col items-center justify-center rounded-lg px-1 py-1 text-center`}
                >
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {index}
                  </span>
                  <span
                    className={`break-keep text-xs font-semibold leading-tight ${
                      tile.kind === "coins"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    {tileLabel(tile)}
                  </span>
                  {current && (
                    <span className="text-xs font-semibold text-selected">내 위치</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div
            style={{ gridColumn: "2 / 5", gridRow: "2 / 9" }}
            className="flex flex-col items-stretch justify-center gap-2 px-1"
          >
            {rolling ? (
              <>
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  disabled={view.dice <= 0 || anyBusy}
                  loading={busy === "roll"}
                  onClick={onRoll}
                >
                  주사위 굴리기
                </Button>
                {view.dice > 1 && (
                  <Button
                    variant="secondary"
                    size="md"
                    fullWidth
                    disabled={anyBusy}
                    loading={busy === "roll_all"}
                    onClick={onRollAll}
                  >
                    모두 굴리기 ({view.dice.toLocaleString("ko-KR")}개)
                  </Button>
                )}
              </>
            ) : (
              <p className="text-center text-sm text-zinc-600 dark:text-zinc-300">
                굴리기가 끝났습니다.
              </p>
            )}
            <p
              aria-live="polite"
              className="min-h-10 text-center text-sm font-medium text-zinc-800 dark:text-zinc-100"
            >
              {lastResult ? resultSummary(lastResult) : ""}
            </p>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              출발을 지날 때마다 주화 {WINTER_LAP_COINS}개
            </p>
          </div>
        </div>
        {rolling && (
          <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            {view.dice <= 0 && (
              <p>
                매일 접속하면 1개, 일일 퀘스트를 하나 완료할 때마다 1개(하루{" "}
                {view.today.questDiceCap}개까지)를 받습니다.
              </p>
            )}
            <p className="tabular-nums">
              {`오늘 받은 주사위: 접속 ${view.today.visitGranted ? 1 : 0}/1 · 일일 퀘스트 ${view.today.questDiceGranted}/${view.today.questDiceCap}`}
            </p>
          </div>
        )}
      </Card>

      <Card padding="md" className="space-y-2">
        <SectionHeading title="누적 바퀴 보상" />
        <ul aria-label="누적 바퀴 보상" className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {view.milestones.map((milestone) => (
            <li
              key={milestone.laps}
              className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-semibold tabular-nums">{milestone.laps}바퀴</span>
                <span className="ml-2 text-zinc-600 dark:text-zinc-300">{milestone.label}</span>
              </span>
              {milestone.claimed ? (
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">받음</span>
              ) : milestone.claimable ? (
                <Button
                  size="sm"
                  disabled={anyBusy}
                  loading={busy === `claim:${milestone.laps}`}
                  onClick={() => onClaim(milestone.laps)}
                >
                  받기
                </Button>
              ) : (
                <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {milestone.laps - view.laps}바퀴 남음
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md" className="space-y-2">
        <SectionHeading title="겨울 교환소" />
        <ul aria-label="겨울 교환소" className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {view.shop.map((item) => {
            const soldOut = item.purchased >= item.limit;
            const affordable = view.coins >= item.cost;
            return (
              <li
                key={item.id}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block text-xs tabular-nums text-amber-700 dark:text-amber-300">
                    주화 {item.cost.toLocaleString("ko-KR")}개
                  </span>
                </span>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {item.purchased}/{item.limit}
                </span>
                <Button
                  size="sm"
                  disabled={soldOut || !affordable || anyBusy}
                  loading={busy === `buy:${item.id}`}
                  onClick={() => onBuy(item.id)}
                >
                  {soldOut ? "완료" : "교환"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      {view.recentRolls.length > 0 && (
        <Card padding="md">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              최근 굴림 기록 {view.recentRolls.length}개
            </summary>
            <ol className="mt-2 space-y-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
              {[...view.recentRolls].reverse().map((event, index) => (
                <li key={index}>{rollEventText(event)}</li>
              ))}
            </ol>
          </details>
        </Card>
      )}
    </>
  );
}

export function V2WinterBoardView() {
  const { view, busy, notice, lastResult, load, roll, claim, buy } = useWinterBoard();

  return (
    <div className="space-y-4">
      {notice && <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>}
      {view ? (
        <WinterBoardContent
          view={view}
          busy={busy}
          lastResult={lastResult}
          onRoll={() => void roll(false)}
          onRollAll={() => void roll(true)}
          onClaim={(laps) => void claim(laps)}
          onBuy={(itemId) => void buy(itemId)}
        />
      ) : (
        <Card padding="md" className="space-y-3 text-sm">
          <p>{notice ? "이벤트 정보를 확인할 수 없습니다." : "겨울 이벤트를 불러오는 중…"}</p>
          {notice && <Button onClick={() => void load()}>다시 시도</Button>}
        </Card>
      )}
    </div>
  );
}
