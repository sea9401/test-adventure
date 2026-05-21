"use client";

import { useEffect, useRef, useState } from "react";
import { CaretRight, X } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  COOP_ATTACK_COOLDOWN_MS,
  COOP_BOSSES,
  COOP_TIER_LABEL,
  COOP_TIER_ORDER,
  COOP_TIER_THRESHOLDS,
  type CoopRewardTier,
} from "./data";
import { useCoopBoss, type CoopClaimResponse } from "./useCoopBoss";
import type { AppliedCoopReward } from "./applyReward";
import type { RegionId } from "@/adventure/data/world";
import type { BattleLogEntry } from "@/adventure/battle/engine";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import { MONSTERS } from "@/adventure/data/monsters";
import type { CoopAttackLogRow } from "./useCoopBoss";

type Props = {
  regionId: string;
  playerName: string;
  /** 공격 직후 캐릭터 hp 갱신. 서버가 derive 한 hp 를 그대로 반영. */
  onPlayerHpChange: (hp: number) => void;
  /**
   * claim 응답 처리 — 서버가 saves_kv 에 이미 적용한 상태. 호출 측에서 inventory/
   * crafting/adventure-log 의 replaceFromSaved 로 통째 교체하고 reward summary 를
   * 반환한다 (보상 토스트 표시용). applied=false (retry) 인 경우 saves 만 replace.
   */
  applyReward: (response: CoopClaimResponse) => AppliedCoopReward;
  /** 토스트 등 알림. */
  notify?: (text: string) => void;
  /** 협동 공격 라운드 1회의 결과를 최근 기록의 "전투 로그" 탭에 남기기 위한 콜백. */
  notifyBattle?: (
    kind: "battle_win" | "battle_lose",
    text: string,
    log: BattleLogEntry[],
  ) => void;
  /** 보스 공격 시작 시 자동 사냥을 끄기 위한 콜백. */
  onStopHunting?: () => void;
  /** 타이머형 자동 사냥(원정) 진행 중 — true 면 공격 불가 (캐릭터가 자리에 없음). */
  dispatched?: boolean;
  /** 서버가 공격/처치 시 set 한 storyFlag 를 클라 상태에도 즉시 반영 (운향 진입로 등이 reload 없이 열리도록). */
  onStoryFlag?: (flagId: string) => void;
  /** 협동 보스가 쓰러진 시점에 1회 호출 — kill 카운터 의뢰(태고의 노룡 처치 등) 진행용.
   *  내 일격이 마지막이든 다른 사람이 마지막이든, 내가 1점 이상 기여한 세션이 처치되면 호출.
   *  sessionId 기준으로 중복 호출 막음. */
  onKill?: (bossName: string) => void;
  /** 보스를 공격(참여)한 순간 호출 — 도감(모험의 서) 조우 기록용. 월드 보스는 개인이
   *  처치를 못 해도(서버 전체가 한 번 잡음) 참여만으로 도감에 떠야 하므로 attack 시 마킹. */
  onEncounter?: (bossName: string) => void;
};

export function CoopBossCard({
  regionId,
  playerName,
  onPlayerHpChange,
  applyReward,
  notify,
  notifyBattle,
  onStopHunting,
  dispatched = false,
  onStoryFlag,
  onKill,
  onEncounter,
}: Props) {
  const { data, error, working, attack, claim } = useCoopBoss(regionId, true);
  const [now, setNow] = useState(() => Date.now());
  // 직전 claim 결과 — 보상 로그로 카드 밑에 노출. 같은 보스에서 재수령 불가라 1번만 표시.
  const [lastClaim, setLastClaim] = useState<{
    tier: CoopRewardTier;
    applied: AppliedCoopReward;
  } | null>(null);
  // 전투 로그 상세 모달 — 카드 안 펼침 대신 별도 큰 페이지로 노출.
  const [openLog, setOpenLog] = useState<CoopAttackLogRow | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  // 이미 kill 카운터에 반영한 sessionId — handleAttack(내 일격이 마지막) 과 polling
  // (다른 사람이 마지막) 양쪽에서 호출될 수 있으므로 중복 방지.
  const creditedSessionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // 폴링으로 본 처치 — 다른 사람의 마지막 일격으로 죽었어도 내가 데미지 1+ 기여했으면
  // kill 카운터 1회 반영. attack 응답 경로(handleAttack)와 sessionId 기준 dedupe.
  useEffect(() => {
    const session = data?.session;
    const my = data?.myContribution;
    if (!session || !my) return;
    if (!session.defeatedAt) return;
    if (my.damage <= 0) return;
    if (creditedSessionsRef.current.has(session.id)) return;
    creditedSessionsRef.current.add(session.id);
    onKill?.(session.bossName);
  }, [data?.session, data?.myContribution, onKill]);

  if (!data) return null;
  if (!data.session) {
    // 세션 row 가 아예 없는 region — cron(매분) 이 곧 첫 spawn.
    return (
      <Card padding="md">
        <div className="text-xs uppercase tracking-wider text-rose-500/70 dark:text-rose-400/70">
          협동 보스
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          현재 등장한 협동 보스가 없습니다 — 곧 등장합니다.
        </p>
      </Card>
    );
  }

  const s = data.session;
  const bossDef = COOP_BOSSES[regionId as RegionId];
  const bossImage = MONSTERS[s.bossName]?.image;
  const my = data.myContribution;
  const top = data.top;
  const recentLogs = data.recentLogs ?? [];
  const hpPct = Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100));
  const expiresMs = new Date(s.expiresAt).getTime() - now;
  // cron 이 매분 도므로 nextSpawnAt(=처치시점+respawnMs) 도달 후 1분 안에 spawn.
  const nextSpawnMs = s.nextSpawnAt
    ? Math.max(0, new Date(s.nextSpawnAt).getTime() - now)
    : 0;
  const cooldownMs = my?.cooldownEndsAt
    ? new Date(my.cooldownEndsAt).getTime() - now
    : 0;
  const onCooldown = cooldownMs > 0;
  const defeated = !!s.defeatedAt;
  const expired = !defeated && expiresMs <= 0;
  const canAttack = !defeated && !expired && !onCooldown && !working && !dispatched;

  // cron(매분) 이 곧 만료 처리하고 nextSpawnAt(=+respawnMs) 을 채운다.
  // 그 직전의 짧은 window 만 fallback 표기 — 추정 = expiresAt + respawnMs.
  const expiredEstimateMs =
    expired && bossDef
      ? Math.max(
          0,
          new Date(s.expiresAt).getTime() + bossDef.respawnMs - now,
        )
      : 0;

  const handleAttack = async () => {
    onStopHunting?.();
    const r = await attack(playerName);
    if (!r) return;
    // 참여(공격) = 도감 조우 기록. 처치 못 해도 이 보스가 모험의 서에 뜨도록.
    onEncounter?.(s.bossName);
    onPlayerHpChange(r.finalPlayerHp);
    // 서버가 박은 storyFlag (참여=peak_giant_engaged 등) 를 클라 상태에 즉시 반영 —
    // reload 없이 운향 진입로가 열리도록.
    r.storyFlagsSet?.forEach((f) => onStoryFlag?.(f));
    // 라운드 1회의 결과를 최근 기록 → 전투 로그에 남긴다. 일반 사냥과 동일한 펼치기 UX.
    if (r.diedEarly) {
      notifyBattle?.(
        "battle_lose",
        `${s.bossName}의 일격에 쓰러졌다 — ${r.damageDealt.toLocaleString()} 데미지 누적.`,
        r.log,
      );
    } else {
      notifyBattle?.(
        "battle_win",
        `${s.bossName}에게 ${r.damageDealt.toLocaleString()} 데미지를 가했다.`,
        r.log,
      );
    }
    if (r.session.defeated) {
      notify?.(`${s.bossName}이(가) 쓰러졌다 — 보상을 수령할 수 있다.`);
    }
  };

  const handleClaim = async () => {
    const r = await claim();
    if (!r) return;
    const applied = applyReward(r);
    setLastClaim({ tier: r.tier, applied });
    notify?.(
      r.applied
        ? `${COOP_TIER_LABEL[r.tier]} 보상 수령 완료`
        : `${COOP_TIER_LABEL[r.tier]} 보상 (이미 받음)`,
    );
  };

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-rose-500 dark:text-rose-400">
          협동 보스
        </span>
        {defeated && (
          <span className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            처치됨
          </span>
        )}
        {expired && (
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            만료
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        {bossImage && (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bossImage}
              alt={s.bossName}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {s.bossName}
        </h4>
      </div>

      {/* HP bar */}
      <div className="mt-2">
        <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          <span>HP</span>
          <span>
            {s.hp.toLocaleString()} / {s.maxHp.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-rose-500 transition-all"
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* status line */}
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        {defeated
          ? s.nextSpawnAt
            ? `다음 등장까지 ${formatDuration(nextSpawnMs)}`
            : "처치됨"
          : expired
            ? bossDef
              ? `만료됨 — 다음 등장까지 약 ${formatDuration(expiredEstimateMs)}`
              : "만료됨 — 다음 등장 대기"
            : `잔여 ${formatDuration(expiresMs)} · 기여자 ${top.length}`}
      </p>

      {/* my contribution */}
      {my && my.damage > 0 && (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-600 dark:text-zinc-300">
              내 기여{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {my.damage.toLocaleString()}
              </span>{" "}
              ({(my.ratio * 100).toFixed(1)}%)
            </span>
            <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {my.tier ? COOP_TIER_LABEL[my.tier] : "—"}
            </span>
          </div>
          <NextTierHint ratio={my.ratio} />
        </div>
      )}

      {/* action buttons */}
      <div className="mt-3 flex flex-col gap-2">
        {!defeated && !expired && (
          <button
            type="button"
            disabled={!canAttack}
            onClick={handleAttack}
            className="rounded-md border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dispatched
              ? "자동 사냥 중 — 도전 불가"
              : working
                ? "공격 중…"
                : onCooldown
                  ? `다음 공격 ${formatDuration(cooldownMs)} 후`
                  : `공격하기 (${formatDuration(COOP_ATTACK_COOLDOWN_MS)} 쿨)`}
          </button>
        )}
        {defeated && my?.claimable && (
          <button
            type="button"
            disabled={working}
            onClick={handleClaim}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working
              ? "수령 중…"
              : `보상 수령 (${my.tier ? COOP_TIER_LABEL[my.tier] : "—"})`}
          </button>
        )}
        {defeated && my?.claimedAt && !lastClaim && (
          <p className="text-center text-xs text-emerald-600 dark:text-emerald-400">
            수령 완료 · {my.claimedTier ? COOP_TIER_LABEL[my.claimedTier] : ""}
          </p>
        )}
        {defeated && (!my || my.damage === 0) && (
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            기여 데미지 없음 — 다음 등장에 도전하세요.
          </p>
        )}
      </div>

      {/* 보상 로그 — 직전 claim 결과 (재료/제작서/칭호) 상세 표시. */}
      {lastClaim && (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            {COOP_TIER_LABEL[lastClaim.tier]} 보상 수령
          </div>
          <ul className="space-y-0.5 text-emerald-800 dark:text-emerald-200">
            {lastClaim.applied.materials.map((m) => (
              <li key={`m-${m.id}`} className="flex justify-between tabular-nums">
                <span>{m.name}</span>
                <span>×{m.count}</span>
              </li>
            ))}
            {lastClaim.applied.recipes.map((r) => (
              <li key={`r-${r.id}`}>📜 {r.name}</li>
            ))}
            {lastClaim.applied.equipment.map((e) => (
              <li key={`e-${e.id}`} className="font-semibold">⚔️ {e.name}</li>
            ))}
            {lastClaim.applied.rings.map((r) => (
              <li key={`ring-${r.instanceId}`} className="font-semibold">
                💍 {r.name}
                {r.options && (
                  <span className="ml-1 font-normal text-emerald-600/80 dark:text-emerald-400/80">
                    ({r.options})
                  </span>
                )}
              </li>
            ))}
            {lastClaim.applied.title && (
              <li className="font-semibold">🏅 {lastClaim.applied.title.name}</li>
            )}
            {lastClaim.applied.materials.length === 0 &&
              lastClaim.applied.recipes.length === 0 &&
              lastClaim.applied.equipment.length === 0 &&
              lastClaim.applied.rings.length === 0 &&
              !lastClaim.applied.title && (
                <li className="text-emerald-600/70 dark:text-emerald-400/70">
                  새로 들어온 항목 없음 (모두 보유 중이거나 굴림 실패).
                </li>
              )}
          </ul>
        </div>
      )}

      {/* 순위 보기 — 누적 데미지 상위 기여자. */}
      {top.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            순위 보기
          </summary>
          <ol className="mt-1 space-y-0.5">
            {top.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className={`flex justify-between tabular-nums ${row.mine ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-200"}`}
              >
                <span>
                  {i + 1}. {row.name}
                </span>
                <span>{row.damage.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* 전투 로그 — 한 줄 = 한 참가자 공격. 클릭하면 별도 모달에 큰 화면으로 로그 노출. */}
      {recentLogs.length > 0 && (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            전투 로그
          </div>
          <ul className="no-scrollbar max-h-72 space-y-2 overflow-y-auto">
            {recentLogs.map((row) => (
              <li
                key={row.id}
                className={`rounded border ${row.mine ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40"}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenLog(row)}
                  disabled={row.log.length === 0}
                  className={`flex w-full cursor-pointer items-baseline justify-between gap-2 p-1.5 text-left tabular-nums hover:bg-zinc-100/60 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-800/40 ${row.mine ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"}`}
                >
                  <span className="min-w-0 truncate">
                    <span className={row.mine ? "font-semibold" : ""}>
                      {row.name}
                    </span>
                    {row.diedEarly && (
                      <span className="ml-1 text-rose-600 dark:text-rose-400">
                        (쓰러짐)
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span>가한 데미지 {row.damageDealt.toLocaleString()}</span>
                    {row.log.length > 0 && (
                      <CaretRight size={12} weight="bold" className="opacity-60" />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {openLog && (
        <CoopBattleLogModal row={openLog} onClose={() => setOpenLog(null)} />
      )}
    </Card>
  );
}

// 협동 전투 로그 전체 화면 모달 — 카드 안 펼침 대신 큰 화면에서 로그를 본다.
// 모바일에선 화면을 거의 꽉 채우는 sheet, 데스크탑에선 가운데 정렬된 큰 패널.
function CoopBattleLogModal({
  row,
  onClose,
}: {
  row: CoopAttackLogRow;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coop-log-title"
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:h-[85vh]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2
              id="coop-log-title"
              className={`truncate text-base font-semibold ${row.mine ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"}`}
            >
              {row.name}
              {row.diedEarly && (
                <span className="ml-1.5 text-sm font-normal text-rose-600 dark:text-rose-400">
                  (쓰러짐)
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
              가한 데미지 {row.damageDealt.toLocaleString()}
              {row.damageTaken > 0 && (
                <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                  · 받은 데미지 {row.damageTaken.toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {row.log.length > 0 ? (
            <BattleLogList entries={row.log} />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              남은 로그가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function NextTierHint({ ratio }: { ratio: number }) {
  const next = COOP_TIER_ORDER.find((t) => ratio < COOP_TIER_THRESHOLDS[t]);
  if (!next) return null;
  const need = (COOP_TIER_THRESHOLDS[next] - ratio) * 100;
  return (
    <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
      다음 {COOP_TIER_LABEL[next]} 까지 +{need.toFixed(1)}%
    </p>
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0초";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0) return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
  return `${seconds}초`;
}

