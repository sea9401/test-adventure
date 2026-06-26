"use client";

// 협동 보스 상세 — 소환된 보스 인스턴스 하나의 토벌 화면(sessionId 단위, #714).
// 구조(옛 레이드 화면의 v2 이식): 보스 일러스트·이름·HP 숫자/바·플레이버 → 공격 버튼 →
// 참전자 명단(내 줄 강조) → 최근 공격 → 내 공격 다시보기. 끝난 세션은 결과 + 보상 수령.

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { StaminaState } from "@/adventure/v2/stamina";
import type { HpBarState } from "@/adventure/v2/HpBar";
import {
  COOP_ATTACK_STAMINA_COST,
  COOP_BOSSES,
  COOP_TIER_LABEL,
  COOP_VISIBILITY_LABEL,
  COOP_VISIBILITY_OPTIONS,
  coopAttackCooldownMs,
  coopEnrageStatus,
} from "@/adventure/data/v2/coopBosses";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import {
  fmtCoopRemain,
  useCoopSessionState,
} from "@/adventure/v2/coop/useCoopBossState";
import {
  CoopRewardCaptions,
  CoopRewardTable,
} from "@/adventure/v2/coop/CoopRewardTable";
import { useEscapeKey } from "@/lib/useEscapeKey";
import type { Gender } from "@/adventure/profile/avatars";

export function V2CoopBossDetailView({
  sessionId,
  playerName,
  playerGender,
  playerSubtitle,
  stamina,
  setStamina,
  setHp,
  onBack,
}: {
  sessionId: string;
  playerName: string;
  playerGender: Gender;
  playerSubtitle?: string;
  stamina: StaminaState;
  setStamina: (s: StaminaState) => void;
  setHp?: (s: HpBarState) => void;
  onBack: () => void;
}) {
  const {
    detail,
    missing,
    busy,
    notice,
    lastAttack,
    lastReward,
    attack,
    claim,
    setVisibility,
  } = useCoopSessionState({
    sessionId,
    setStamina,
    onHpAfterAttack: (r) => {
      setHp?.({ hp: r.hpAfter, maxHp: r.maxHp, anchorMs: Date.now() });
    },
  });
  const [now, setNow] = useState(() => Date.now());
  // 기여 보상 상세 모달(보상 캡션 = 무엇을 주나). 헤더 우측 버튼으로 연다.
  const [rewardInfoOpen, setRewardInfoOpen] = useState(false);
  useEscapeKey(() => setRewardInfoOpen(false));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (missing) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
        <SubViewHeader title="협동 보스" onBack={onBack} />
        <Card padding="md">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            존재하지 않는 토벌입니다.
          </p>
        </Card>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
        <SubViewHeader title="협동 보스" onBack={onBack} />
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      </main>
    );
  }

  const { session, my } = detail;
  const def = COOP_BOSSES[session.kind];
  // 활성 판정 — 서버 sweep 전이라도 시간상 만료면 비활성 취급(공격 버튼 숨김).
  const ended =
    session.defeated || session.expired || session.expiresAt <= now;
  const active = !ended;
  const hpPct = Math.max(0, Math.min(100, (session.hp / session.maxHp) * 100));
  // 발악 단계 라이브 상태 — 현재 공유 HP 기준 발동/임박 단계(활성 보스만 표시).
  const enrage = active
    ? coopEnrageStatus(def, session.hp / session.maxHp)
    : null;
  const cooldownLeft =
    my.lastAttackAt != null
      ? my.lastAttackAt + coopAttackCooldownMs() - now
      : 0;
  const onCooldown = active && cooldownLeft > 0;
  // 코어루프 — 공격 무료(소환권이 비용) → 스태미나 게이트 없음. off — 기존 스태미나 차감.
  const lowStamina =
    !V2_CORE_LOOP_V2 && stamina.current < COOP_ATTACK_STAMINA_COST;
  const claimable = session.defeated && !my.claimed && my.tier != null;
  // 공개 범위 — 소환자(활성)는 변경 컨트롤, 그 외 모두(비참여자 포함)는 읽기 전용 배지로 현재 범위 노출.
  const showScopeControl = V2_CORE_LOOP_V2 && session.isOwner && active;
  const showScopeBadge = V2_CORE_LOOP_V2 && !showScopeControl;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={def.name}
        onBack={onBack}
        right={
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {session.defeated
              ? "토벌 완료"
              : session.expired || session.expiresAt <= now
                ? "만료"
                : fmtCoopRemain(session.expiresAt - now)}
          </span>
        }
      />

      {/* 보스 헤더 — 일러스트·이름·HP·플레이버 */}
      <Card padding="md" className="space-y-3 text-center">
        <img
          src={def.base.image}
          alt={def.name}
          className={`mx-auto h-28 w-28 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700 ${
            active ? "" : "opacity-50 grayscale"
          }`}
        />
        <div>
          {session.summonedByName && (
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {session.summonedByName} 님이 소환
            </p>
          )}
          {showScopeBadge && (
            <span className="mt-1 inline-block rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              공개 범위 · {COOP_VISIBILITY_LABEL[session.visibility]}
            </span>
          )}
          <p className="mt-0.5 font-mono text-sm text-zinc-600 dark:text-zinc-300">
            {session.hp.toLocaleString()} / {session.maxHp.toLocaleString()}
          </p>
        </div>
        <div className="h-3 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full rounded transition-[width] ${
              session.defeated ? "bg-zinc-400" : "bg-rose-500"
            }`}
            style={{ width: `${hpPct}%` }}
          />
        </div>

        {/* 발악 단계 트래커 — 현재 HP 기준 발동(🔥)/임박(⚠)/예정 단계를 라이브로. 토벌이
            진행될수록 보스가 더 사나워지는 것을 미리 보여준다(예고). */}
        {enrage && enrage.totalStages > 0 && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-center gap-1">
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                발악 {enrage.activeCount}/{enrage.totalStages}
              </span>
              {enrage.stages.map(({ stage, active: on }) => {
                const isNext = enrage.nextStage === stage;
                return (
                  <span
                    key={stage.hpFraction}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      on
                        ? "border border-rose-400/60 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : isNext
                          ? "animate-pulse border border-amber-400 text-amber-700 dark:text-amber-300"
                          : "border border-zinc-200 text-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    {on ? "🔥 " : isNext ? "⚠ " : ""}HP{" "}
                    {Math.round(stage.hpFraction * 100)}%
                  </span>
                );
              })}
            </div>
            {enrage.nextStage && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                다음 발악 (HP {Math.round(enrage.nextStage.hpFraction * 100)}%) —{" "}
                {enrage.nextStage.note}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">{def.desc}</p>
        {def.traits.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1">
            {def.traits.map((t) => (
              <span
                key={t}
                className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {active && (
          <button
            type="button"
            disabled={busy || onCooldown || lowStamina}
            onClick={() => void attack()}
            className="mx-auto w-full max-w-xs rounded-md border border-rose-600 bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy
              ? "전투 중…"
              : onCooldown
                ? `재공격 ${Math.ceil(cooldownLeft / 1000)}초 후`
                : lowStamina
                  ? `스태미너 부족 (${COOP_ATTACK_STAMINA_COST} 필요)`
                  : V2_CORE_LOOP_V2
                    ? "공격"
                    : `공격 (스태미너 ${COOP_ATTACK_STAMINA_COST})`}
          </button>
        )}
        {session.defeated && (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            모험가들의 손에 쓰러졌다!
          </p>
        )}
        {!session.defeated && ended && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            시간 안에 쓰러뜨리지 못했다 — 보스는 떠났다.
          </p>
        )}
        {claimable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void claim()}
            className="mx-auto w-full max-w-xs rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            기여 보상 수령 ({my.tier ? COOP_TIER_LABEL[my.tier] : ""})
          </button>
        )}
        {my.damage > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            내 누적 {my.damage.toLocaleString()} ({my.attackCount}회)
            {my.tier && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {COOP_TIER_LABEL[my.tier]}
              </span>
            )}
            {session.defeated && my.claimed && " · 보상 수령 완료"}
          </p>
        )}
      </Card>

      {/* 소환자 전용 — 소환 후 공개 범위 변경. 나만/길드원만으로 시작해 기여 보상을 쌓은 뒤 공개로. */}
      {showScopeControl && (
        <Card padding="md" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">공개 범위</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              소환자 전용
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            기여 보상을 충분히 쌓은 뒤 공개로 바꿔 다른 모험가들과 함께 잡을 수
            있어요.
          </p>
          <div className="flex gap-1.5">
            {COOP_VISIBILITY_OPTIONS.map(([val, label]) => {
              const cur = session.visibility === val;
              return (
                <button
                  key={val}
                  type="button"
                  disabled={busy || cur}
                  onClick={() => void setVisibility(val)}
                  aria-pressed={cur}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition disabled:cursor-default ${
                    cur
                      ? "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                      : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {notice && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </div>
      )}

      {/* 기여 보상 테이블 — 내 현재 티어 강조 + 다음 티어까지(때리는 중 동기부여). */}
      {!session.defeated && (
        <Card padding="md" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">기여 보상</div>
            <button
              type="button"
              onClick={() => setRewardInfoOpen(true)}
              className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              보상 보기
            </button>
          </div>
          <CoopRewardTable kind={def} myDamage={my.damage} hideCaptions />
        </Card>
      )}

      {/* 기여 보상 상세 모달 — 무엇을 주나(SP 열매·보스 유니크 트로피). 인라인 캡션 대체. */}
      {rewardInfoOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setRewardInfoOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="기여 보상 상세"
            className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                기여 보상 — {def.name}
              </h2>
              <button
                type="button"
                onClick={() => setRewardInfoOpen(false)}
                className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <CoopRewardCaptions kind={def} />
          </div>
        </>
      )}

      {lastReward &&
        (lastReward.spFruitCount > 0 || lastReward.uniqueId ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {COOP_TIER_LABEL[lastReward.tier]} 보상 획득!
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {lastReward.uniqueId && (
                <li>
                  ⚔️ 보스 유니크{" "}
                  <span className="font-semibold">{lastReward.uniqueName}</span>{" "}
                  — 인벤토리에서 확인!
                </li>
              )}
              {lastReward.spFruitCount > 0 && (
                <li>
                  🍂 {lastReward.spFruitName ?? "SP 열매"} ×
                  {lastReward.spFruitCount} — 소모품 탭에서 사용 시 SP 최대치 ↑
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {COOP_TIER_LABEL[lastReward.tier]} 기여 — 이번엔 드랍 없음. (SP 열매
              GOLD+·유니크 EPIC+ 확률)
            </p>
          </div>
        ))}

      {/* 내 공격 결과 — 요약 + 전투 다시보기 */}
      {lastAttack && (
        <Card padding="md" className="space-y-2">
          <div className="text-sm font-semibold">
            ⚔{" "}
            <span className="text-rose-600 dark:text-rose-400">
              {lastAttack.damageDealt.toLocaleString()}
            </span>{" "}
            데미지 ({lastAttack.turns}턴{lastAttack.diedEarly && " · 쓰러짐"}
            {lastAttack.defeated && " · 처치 확정타!"})
          </div>
          {lastAttack.replay && (
            <ReplayBattleScene
              payload={lastAttack.replay}
              playerName={playerName}
              gender={playerGender}
              exp={0}
              maxExp={1}
              hpCharges={lastAttack.hpCharges}
              mpCharges={lastAttack.mpCharges}
              playerSubtitle={playerSubtitle}
            />
          )}
        </Card>
      )}

      {/* 참전자 명단 — 데미지 내림차순, 내 줄 강조 */}
      {detail.top.length > 0 && (
        <Card padding="md" className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">참전자</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {detail.participantCount}명
            </span>
          </div>
          <div className="space-y-0.5">
            {detail.top.map((t, i) => (
              <div
                key={`${t.name}-${i}`}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                  t.isMe
                    ? "bg-amber-50 font-medium dark:bg-amber-950/40"
                    : i % 2 === 1
                      ? "bg-zinc-50 dark:bg-zinc-900/60"
                      : ""
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 inline-block w-6 text-right text-xs text-zinc-400">
                    {i + 1}
                  </span>
                  {t.name}
                  {t.isMe && (
                    <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                      나
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                  {t.damage.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 최근 공격 활동 */}
      {detail.recentAttacks.length > 0 && (
        <Card padding="md" className="space-y-1">
          <div className="text-sm font-semibold">최근 공격</div>
          {detail.recentAttacks.map((a, i) => (
            <div
              key={`${a.at}-${i}`}
              className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400"
            >
              <span className="truncate">
                {a.name}
                {a.diedEarly && " 💀"}
              </span>
              <span className="shrink-0 font-mono">
                -{a.damageDealt.toLocaleString()}
              </span>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}
