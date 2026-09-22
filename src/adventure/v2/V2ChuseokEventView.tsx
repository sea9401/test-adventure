"use client";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import { CalendarCheck, Check, Gift, Sword } from "@phosphor-icons/react";
import { CHUSEOK_ATTENDANCE_REWARDS, CHUSEOK_CLEAR_REWARD, CHUSEOK_DAILY_ATTACKS, CHUSEOK_LUCKY_BAG_IMAGE, type ChuseokState } from "@/adventure/data/v2/chuseokEvent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { PlumpGameIcon } from "@/components/icons/PlumpGameIcon";
import { useChuseokEvent } from "./useChuseokEvent";
import { ReplayBattleScene } from "./ReplayBattleScene";
import { useGameIdentityState } from "./GameStateProvider";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const number = (value: number) => value.toLocaleString("ko-KR");
const CHUSEOK_TABS = [
  { key: "attendance", label: "출석", icon: <CalendarCheck size={18} /> },
  { key: "lucky-bag", label: "복주머니", icon: <Gift size={18} /> },
] as const;

export function V2ChuseokEventView() {
  const { state, busy, notice, lastAttack, load, attend, attack } = useChuseokEvent();
  const { viewerGender, viewerName, playerSubtitle } = useGameIdentityState();
  const raidResult = lastAttack && <>
      <Card className="space-y-2" aria-live="polite">
        <h3 className="font-bold">복주머니 공격 결과</h3>
        <p className="text-sm">{number(lastAttack.damageDealt)} 피해 · {lastAttack.stagesCleared}단계 처치</p>
        {lastAttack.stagesCleared > 0 && <p className="text-sm">참여자 전원에게 스태미나 회복약 {lastAttack.stagesCleared * CHUSEOK_CLEAR_REWARD}개가 우편으로 지급되었습니다.</p>}
      </Card>
      <ReplayBattleScene payload={lastAttack.replay} startPlayerHp={lastAttack.replay.playerMaxHp} playerName={viewerName} gender={viewerGender} exp={0} maxExp={1} playerSubtitle={playerSubtitle} logTitle="복주머니 전투 로그" />
    </>;
  return <div className={`${SURFACE_CARD} space-y-4 p-3`}>
    {notice && <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>}
    {!state ? <Card className="space-y-3 text-sm">
      <p>{notice ? "이벤트 정보를 확인할 수 없습니다." : "추석 이벤트를 불러오는 중…"}</p>
      {notice && <Button onClick={() => void load()}>다시 시도</Button>}
    </Card> : <ChuseokEventContent state={state} busy={busy} onAttend={() => void attend()} onAttack={() => void attack()} raidResult={raidResult} />}
  </div>;
}

export function ChuseokEventContent({ state, busy, onAttend, onAttack, raidResult }: {
  state: ChuseokState; busy: "attendance" | "attack" | null; onAttend: () => void; onAttack: () => void;
  raidResult?: ReactNode;
}) {
  const [tab, setTab] = useState<"attendance" | "lucky-bag">("attendance");
  const { attendance, raid, phase, window } = state;
  const active = phase === "active";
  const tabs = CHUSEOK_TABS.map((item) => {
    const pending = active && (item.key === "attendance" ? attendance.canClaim : raid.attacksRemaining > 0);
    return pending ? {
      ...item, badge: "!",
      badgeLabel: item.key === "attendance" ? "추석 출석 보상 받기 가능" : "복주머니 공격 가능",
    } : item;
  });
  return <>
    <Card padding="lg" className="space-y-3">
      <div className="flex items-center gap-3"><Gift size={32} weight="duotone" className="text-amber-600 dark:text-amber-400" /><h2 className="text-xl font-bold">풍성한 한가위</h2></div>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">매일 출석하고, 모두 함께 복주머니를 두드려 스태미나 회복약을 모아보세요.</p>
      <p className="text-sm font-medium">{window ? `${dateFormat.format(window.startsAt)} ~ ${dateFormat.format(window.endsAt)} (한국 시간)` : "시작 일정 준비 중 · 시작 후 10일간 진행"}</p>
      {phase !== "active" && <StatusBanner tone="info">{phase === "pending" ? "이벤트 시작 전입니다." : "추석 이벤트가 종료되었습니다. 받은 토벌 보상은 우편함에서 확인해 주세요."}</StatusBanner>}
    </Card>
    <Card padding="none" className="px-2 pt-1">
      <TabBar tabs={tabs} active={tab} onChange={setTab} ariaLabel="추석 이벤트 활동" variant="highlight" badgeVariant="alert" className="justify-center" />
    </Card>
    <section role="tabpanel" aria-label={tab === "attendance" ? "추석 출석" : "추석 복주머니"} className="space-y-4">
    {tab === "attendance" ? <Card padding="md" className="space-y-4">
      <h3 className="flex items-center gap-2 font-bold"><CalendarCheck size={22} /> 한가위 7일 출석</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">한국 시간 매일 00시에 출석 기회가 열립니다. 빠진 날이 있어도 진도는 유지되며, 월간 출석과 별도로 받을 수 있습니다.</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {CHUSEOK_ATTENDANCE_REWARDS.map((reward, index) => {
          const claimed = index < attendance.claimedCount;
          return <div key={index} className={`${claimed ? SURFACE_INSET : index === attendance.claimedCount ? SURFACE_ACCENT : SURFACE_INSET} flex flex-col items-center gap-1 rounded-xl p-2 text-sm`}>
            <span className="text-xs">{index + 1}일차</span>
            <PlumpGameIcon name="stamina_potion" size={28} />
            <strong>{reward}개</strong>
            <span className="flex min-h-5 items-center text-xs text-zinc-600 dark:text-zinc-300">{claimed ? <><Check size={12} /> 받음</> : "회복약"}</span>
          </div>;
        })}
      </div>
      <p className="text-sm">누적 출석 {attendance.claimedCount} / 7일 · 총 회복약 80개</p>
      <Button variant="primary" fullWidth disabled={!active || !attendance.canClaim || busy !== null} loading={busy === "attendance"} onClick={onAttend}>
        {attendance.complete ? "7일 출석 완료" : attendance.claimedToday ? "오늘 출석 완료" : `출석 보상 받기 · ${attendance.nextReward ?? 0}개`}
      </Button>
    </Card> : <>
    <Card padding="md" className="space-y-4">
      <h3 className="flex items-center gap-2 font-bold"><Sword size={22} /> 모두 함께 복주머니 토벌</h3>
      <div className={`${SURFACE_INSET} space-y-3 rounded-xl p-4 text-center`}>
        <Image
          src={CHUSEOK_LUCKY_BAG_IMAGE}
          alt="수채화로 그린 전통 추석 복주머니"
          width={512}
          height={512}
          sizes="(max-width: 640px) 224px, 288px"
          className="mx-auto aspect-square w-56 max-w-full object-contain sm:w-72"
        />
        <p className="font-bold">{raid.stage}단계 복주머니</p>
        <div role="progressbar" aria-label="복주머니 남은 체력" aria-valuemin={0} aria-valuemax={raid.maxHp} aria-valuenow={raid.hp} className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div className="h-full rounded-full bg-violet-600 dark:bg-violet-400" style={{ width: `${Math.max(0, Math.min(100, raid.hp / raid.maxHp * 100))}%` }} />
        </div>
        <p className="text-sm tabular-nums">{number(raid.hp)} / {number(raid.maxHp)}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">1단계 1억 → 2단계 5억 → 3단계 10억 → 이후 5억씩 증가</p>
      </div>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">길드와 관계없이 모든 모험가가 같은 복주머니를 공격합니다. 공격력과 방어력이 낮아 부담 없이 참여할 수 있습니다. 스태미나와 현재 HP·MP는 소모하지 않습니다.</p>
      <div className={`${SURFACE_ACCENT} rounded-xl p-3 text-sm leading-6`}>한 번 공격하면 참여자로 등록됩니다. 참여 이후 복주머니를 하나 처치할 때마다 참여자 전원에게 회복약 <strong>{CHUSEOK_CLEAR_REWARD}개</strong>를 우편으로 드립니다. 참여 전 처치 보상은 지급되지 않습니다.</div>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span>참여자 {number(raid.participantCount)}명</span><span>내 누적 피해 {number(raid.myDamage)}</span></div>
      <Button variant="primary" fullWidth disabled={!active || raid.attacksRemaining === 0 || busy !== null} loading={busy === "attack"} onClick={onAttack}>
        {raid.attacksRemaining === 0 ? "오늘 공격 완료" : `복주머니 공격 · 오늘 ${raid.attacksRemaining}/${CHUSEOK_DAILY_ATTACKS}회 남음`}
      </Button>
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">공격 기회는 한국 시간 매일 00시에 {CHUSEOK_DAILY_ATTACKS}회로 초기화됩니다.</p>
    </Card>
    {raidResult}
    </>}
    </section>
  </>;
}
