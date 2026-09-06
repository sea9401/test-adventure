"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CaretLeft,
  CaretRight,
  Clock,
  FilmStrip,
  Gift,
  ShieldCheck,
  Sword,
} from "@phosphor-icons/react";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import type { Gender } from "@/adventure/profile/avatars";
import { useGameIdentityState } from "@/adventure/v2/GameStateProvider";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type {
  GuildRaidPagination,
  GuildRaidPracticeResult,
  GuildRaidState,
} from "./guildRaidTypes";
import { useGuildRaid } from "./useGuildRaid";

export type { GuildRaidState } from "./guildRaidTypes";

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드 가입 후 토벌전에 참여할 수 있습니다.",
  no_character: "전투할 캐릭터 정보를 찾을 수 없습니다.",
  daily_limit: "오늘 공격을 모두 마쳤습니다.",
  guild_locked: "이번 주에는 처음 참여한 길드로만 공격할 수 있습니다.",
  event_ended: "이번 토벌전이 종료되었습니다.",
  load_failed: "토벌전 정보를 불러오지 못했습니다.",
  attack_failed: "공격을 완료하지 못했습니다.",
  practice_failed: "연습 전투를 완료하지 못했습니다.",
  claim_not_open: "보상은 토요일과 일요일에 받을 수 있습니다.",
  reward_expired: "지난 토벌전의 미수령 보상이 소멸했습니다.",
  not_settled: "최종 순위를 정산하고 있습니다.",
  not_eligible: "개인 참여 조건을 달성하지 못했습니다.",
  already_claimed: "이미 보상을 받았습니다.",
  claim_failed: "보상을 받지 못했습니다.",
};

const KST_DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString("ko-KR");
}

function formatEndsAt(timestamp: number): string {
  return Number.isFinite(timestamp)
    ? `${KST_DATE_TIME.format(new Date(timestamp))} 종료`
    : "종료 시각 확인 중";
}

export function GuildRaidPanel() {
  const {
    state,
    loading,
    attacking,
    practicing,
    claiming,
    error,
    lastAttack,
    lastPractice,
    load,
    attack,
    practice,
    claim,
    setLeaderboardPage,
    setRecentPage,
  } = useGuildRaid();
  const { viewerGender, playerSubtitle } = useGameIdentityState();

  if (loading && !state) {
    return (
      <Card padding="md" className="text-center text-sm text-zinc-500">
        토벌전 정보를 불러오는 중…
      </Card>
    );
  }
  if (!state) {
    return (
      <LoadErrorBanner
        message={ERROR_TEXT[error ?? ""] ?? ERROR_TEXT.load_failed}
        onRetry={() => void load()}
      />
    );
  }
  return (
    <GuildRaidPanelContent
      state={state}
      attacking={attacking}
      practicing={practicing}
      claiming={claiming}
      error={error}
      lastAttack={lastAttack}
      lastPractice={lastPractice}
      onAttack={() => void attack()}
      onPractice={() => void practice()}
      onClaim={() => void claim()}
      viewerGender={viewerGender}
      playerSubtitle={playerSubtitle}
      onLeaderboardPage={(page) => void setLeaderboardPage(page)}
      onRecentPage={(page) => void setRecentPage(page)}
    />
  );
}

export function GuildRaidPanelContent({
  state,
  attacking,
  practicing = false,
  claiming = false,
  error,
  lastAttack,
  lastPractice = null,
  onAttack,
  onPractice = () => undefined,
  onClaim = () => undefined,
  viewerGender = "male1",
  playerSubtitle,
  onLeaderboardPage = () => undefined,
  onRecentPage = () => undefined,
}: {
  state: GuildRaidState;
  attacking: boolean;
  practicing?: boolean;
  claiming?: boolean;
  error: string | null;
  lastAttack?: { damageDealt: number; stagesCleared: number } | null;
  lastPractice?: GuildRaidPracticeResult | null;
  onAttack: () => void;
  onPractice?: () => void;
  onClaim?: () => void;
  viewerGender?: Gender;
  playerSubtitle?: string;
  onLeaderboardPage?: (page: number) => void;
  onRecentPage?: (page: number) => void;
}) {
  const boss = COOP_BOSSES[state.event.bossKind];
  const active = state.event.phase === "active";
  const settling = state.event.status === "settling";
  const guildLocked =
    state.my.lockedGuildId != null &&
    state.my.lockedGuildId !== state.guild.id;
  const exhausted = state.my.remainingAttacks <= 0;
  const canAttack = active && !guildLocked && !exhausted;
  const hpPct =
    state.event.maxHp > 0
      ? Math.max(0, Math.min(100, (state.event.hp / state.event.maxHp) * 100))
      : 0;
  const rankText = state.guild.rank
    ? settling
      ? `정산 중 · 잠정 ${state.guild.rank}위`
      : `${active ? "현재" : "최종"} ${state.guild.rank}위`
    : active
      ? "순위 집계 전"
      : settling
        ? "정산 중"
        : "최종 순위 없음";
  const actionText = settling
    ? "최종 순위를 정산하고 있습니다"
    : !active
      ? "이번 토벌전이 종료되었습니다"
    : guildLocked
      ? "참여 길드가 고정되었습니다"
      : exhausted
        ? "오늘 공격을 모두 마쳤습니다"
        : "토벌전 공격";
  const visibleError = error ? ERROR_TEXT[error] ?? ERROR_TEXT.attack_failed : null;

  return (
    <section className="space-y-3" aria-label="길드 토벌전">
      <Card padding="none" className="overflow-hidden">
        <div className="grid md:grid-cols-[15rem_1fr]">
          <div className="relative min-h-52 bg-zinc-100 dark:bg-zinc-950">
            <Image
              src={boss.base.image ?? "/images/monster/v2/sangoon.webp"}
              alt={boss.name}
              fill
              sizes="(min-width: 768px) 240px, 100vw"
              className="object-contain p-4 drop-shadow-xl"
            />
          </div>
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  주간 길드 토벌전 · {state.event.stage}단계
                </p>
                <h2 className="mt-1 text-xl font-black">{boss.name}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {boss.desc}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {rankText}
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold">단계 생명력</span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatNumber(state.event.hp)} / {formatNumber(state.event.maxHp)}
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                role="progressbar"
                aria-label="보스 생명력"
                aria-valuemin={0}
                aria-valuemax={state.event.maxHp}
                aria-valuenow={state.event.hp}
              >
                <div
                  className="h-full rounded-full bg-rose-600 transition-[width]"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <Clock size={15} /> {formatEndsAt(state.event.endsAt)} (KST)
            </div>
            <Button
              variant="danger"
              size="md"
              fullWidth
              loading={attacking}
              disabled={!canAttack || practicing}
              onClick={onAttack}
            >
              <Sword size={18} weight="fill" /> {actionText}
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              loading={practicing}
              loadingLabel="연습 전투 진행 중"
              disabled={attacking}
              onClick={onPractice}
            >
              <Sword size={18} /> 연습 전투
            </Button>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              토벌전이 끝난 뒤에도 연습할 수 있으며, 공격 횟수와 피해·보상에
              반영되지 않습니다.
            </p>
            <p className="text-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              남은 공격 {state.my.remainingAttacks}/{state.my.dailyAttackLimit}
            </p>
          </div>
        </div>
      </Card>

      {visibleError && (
        <Card padding="sm" className="border-rose-300 text-sm text-rose-700 dark:border-rose-800 dark:text-rose-300">
          {visibleError}
        </Card>
      )}
      {lastAttack && (
        <Card padding="sm" className="border-emerald-300 text-sm text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">
          {formatNumber(lastAttack.damageDealt)} 피해를 주었습니다.
          {lastAttack.stagesCleared > 0 &&
            ` · ${lastAttack.stagesCleared}단계 돌파`}
        </Card>
      )}
      {lastPractice && (
        <>
          <Card padding="sm" className="space-y-2 border-sky-300 dark:border-sky-800">
            <h3 className="text-sm font-bold text-sky-700 dark:text-sky-300">
              연습 결과
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {formatNumber(lastPractice.damageDealt)}
              </span>{" "}
              피해 · 최종 HP 감소량 {formatNumber(lastPractice.damageTaken)} · {lastPractice.turns}행동
              {lastPractice.diedEarly ? " · 전투불능" : " · 공격 완료"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              길드 진행과 개인 기록에는 반영되지 않았습니다.
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              회복을 반영한 전투 종료 시 HP 감소량이며, 누적 피격량이 아닙니다.
            </p>
          </Card>
          <ReplayBattleScene
            payload={lastPractice.replay}
            startPlayerHp={lastPractice.replay.playerMaxHp}
            playerName={lastPractice.playerName}
            gender={viewerGender}
            exp={0}
            maxExp={1}
            playerSubtitle={playerSubtitle}
            outcome={lastPractice.diedEarly ? "lose" : undefined}
            logTitle={`${COOP_BOSSES[lastPractice.bossKind].name} 연습 전투 로그`}
          />
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card padding="md" className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Sword size={18} className="text-rose-500" /> 내 기여
          </h3>
          <div className="text-2xl font-black tabular-nums">
            {formatNumber(state.my.damage)}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            누적 {state.my.attackCount}회 공격
          </p>
          <div className={`${SURFACE_INSET} p-3 text-xs`}>
            {state.my.eligible ? (
              <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck size={16} /> 참여 조건 달성
              </span>
            ) : (
              "개인 참여 조건: 누적 3회 공격 및 1 이상의 피해"
            )}
          </div>
        </Card>

        <Card padding="md" className="space-y-3">
          <h3 className="text-sm font-bold">{state.guild.name} 전적</h3>
          <div className="text-2xl font-black tabular-nums">
            {formatNumber(state.guild.damage)}
          </div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {rankText}
          </p>
          <div className={`${SURFACE_INSET} p-3 text-xs text-zinc-600 dark:text-zinc-300`}>
            {state.my.reward ? (
              <div className="space-y-2">
                <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {formatNumber(state.my.reward.gold)} 골드 · 숙련의 증표{" "}
                  {formatNumber(state.my.reward.masteryCertificates)}개
                </p>
                {state.my.rewardClaimedAt != null ? (
                  <p className="text-emerald-700 dark:text-emerald-300">보상 수령 완료</p>
                ) : state.event.phase === "claim" ? (
                  <Button
                    variant="warning"
                    size="sm"
                    fullWidth
                    loading={claiming}
                    disabled={!state.my.canClaim}
                    onClick={onClaim}
                  >
                    <Gift size={16} weight="fill" /> 보상 수령
                  </Button>
                ) : state.event.phase === "active" ? (
                  <p>토벌 종료 후 토·일요일에 직접 수령할 수 있습니다.</p>
                ) : (
                  <p>미수령 보상이 소멸했습니다.</p>
                )}
              </div>
            ) : (
              "참여 길드 순위가 확정되면 개인 보상이 표시됩니다."
            )}
          </div>
        </Card>
      </div>

      <Card padding="md" className="space-y-3">
        <h3 className="text-sm font-bold">길드 순위</h3>
        {state.leaderboard.length === 0 ? (
          <p className="text-sm text-zinc-500">아직 참여한 길드가 없습니다.</p>
        ) : (
          <ol className="space-y-2">
            {state.leaderboard.map((row) => (
              <li
                key={row.guildId}
                className={`${SURFACE_INSET} flex items-center gap-3 px-3 py-2 text-sm`}
              >
                <span className="w-7 text-center font-black tabular-nums">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {row.guildName}
                </span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-300">
                  {formatNumber(row.damage)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <PaginationControls
          pagination={state.leaderboardPagination}
          onPageChange={onLeaderboardPage}
          label="길드 순위"
        />
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card padding="md" className="space-y-3">
          <h3 className="text-sm font-bold">길드원 기여도</h3>
          {state.members.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 공격 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {state.members.map((member) => (
                <li key={member.userId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  <span className="text-xs text-zinc-500">{member.attackCount}회</span>
                  <span className="font-semibold tabular-nums">
                    {formatNumber(member.damage)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="md" className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <FilmStrip size={18} /> 최근 전투 기록
          </h3>
          {state.recentAttacks.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 전투 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {state.recentAttacks.map((attack) => (
                <li key={attack.id}>
                  <Link
                    href={`/guild/raid/log/${attack.id}`}
                    className={`${SURFACE_INSET} flex items-center gap-2 px-3 py-2 hover:border-amber-400`}
                  >
                    <span className="min-w-0 flex-1 truncate">{attack.name}</span>
                    <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {formatNumber(attack.damageDealt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <PaginationControls
            pagination={state.recentPagination}
            onPageChange={onRecentPage}
            label="최근 전투"
          />
        </Card>
      </div>
    </section>
  );
}

function PaginationControls({
  pagination,
  onPageChange,
  label,
}: {
  pagination: GuildRaidPagination;
  onPageChange: (page: number) => void;
  label: string;
}) {
  return (
    <nav className="flex items-center justify-center gap-2" aria-label={`${label} 페이지`}>
      <Button
        variant="secondary"
        size="xs"
        aria-label={`${label} 이전 페이지`}
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        <CaretLeft size={14} /> 이전
      </Button>
      <span className="min-w-14 text-center text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
        {pagination.page} / {pagination.totalPages}
      </span>
      <Button
        variant="secondary"
        size="xs"
        aria-label={`${label} 다음 페이지`}
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        다음 <CaretRight size={14} />
      </Button>
    </nav>
  );
}
