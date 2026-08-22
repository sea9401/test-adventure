"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { DANGEROUS_BOSSES, DANGEROUS_ZONES } from "@/adventure/data/v2/dangerousFishing";
import type { DangerousBossReward } from "@/lib/server/dangerousFishingBoss";
import type {
  DangerousEncounterView,
  DangerousFishingAction,
} from "./dangerousFishingEncounter";
import type { DangerousFishingFeedback } from "./dangerousFishingFeedback";
import { DangerousFishingEncounterPanel } from "./DangerousFishingEncounterPanel";
import { DangerousFishingFeedbackCard } from "./DangerousFishingFeedbackCard";
import { DangerousFishingRealtimePanel } from "./DangerousFishingRealtimePanel";
import type {
  DangerousRealtimeClientEncounter,
  DangerousRealtimeJsonReader,
} from "./useDangerousFishingRealtime";
import type { ActivityVerificationChallenge } from "./useActivityVerification";

export type DangerousFishingBossViewModel = {
  ok: true;
  now: number;
  event: {
    id: string;
    bossId: string;
    name: string;
    stamina: number;
    maxStamina: number;
    status: "active" | "defeated" | "expired";
    spawnedAt: number;
    expiresAt: number;
    defeatedAt: number | null;
    isDiscoverer: boolean;
    isLastHaul: boolean;
  } | null;
  contribution: {
    totalContribution: number;
    successfulAttempts: number;
    rewardClaimedAt: number | null;
  } | null;
  attempt: {
    eventId: string;
    encounter: DangerousEncounterView;
  } | null;
  realtimeAttempt: {
    eventId: string;
    encounter: DangerousRealtimeClientEncounter;
  } | null;
  eligible: boolean;
  claimed: boolean;
  rewardPreview: DangerousBossReward | null;
};

function remainingLabel(expiresAt: number, now: number): string {
  const remaining = Math.max(0, expiresAt - now);
  if (remaining >= 60 * 60_000) {
    return `약 ${Math.ceil(remaining / (60 * 60_000))}시간 남음`;
  }
  return `${Math.ceil(remaining / 60_000)}분 남음`;
}

export function DangerousFishingBossPanel({
  model,
  busy,
  feedback = null,
  onStart,
  onAction,
  onClaim,
  onOpenShop,
  readJson,
  verification = null,
  onRealtimeFinish,
}: {
  model: DangerousFishingBossViewModel | null;
  busy: boolean;
  feedback?: DangerousFishingFeedback | null;
  onStart: (eventId: string) => Promise<boolean>;
  onAction: (
    action: DangerousFishingAction,
    eventId: string,
    encounterId: string,
    revision: number,
  ) => Promise<boolean>;
  onClaim: (eventId: string) => Promise<boolean>;
  onOpenShop?: () => void;
  readJson: DangerousRealtimeJsonReader;
  verification?: ActivityVerificationChallenge | null;
  onRealtimeFinish: (response: Record<string, unknown>) => void;
}) {
  if (!model?.event) {
    return (
      <section className={`${SURFACE_CARD} space-y-3 p-4`}>
        <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
          <Image
            src={DANGEROUS_ZONES.abyssal_rift.imageSrc}
            alt="거대어의 흔적을 찾는 심연 균열"
            fill
            sizes="(min-width: 780px) 720px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="text-center">
          <h2 className="font-bold">현재 포착된 거대어가 없습니다</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            위험도 4 이상에서 영웅·전설 어종을 낚으면 거대어의 흔적을 발견할 수 있습니다.
          </p>
        </div>
        <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs leading-5`}>
          <p>거대어를 발견하면 모든 낚시꾼이 함께 제압합니다.</p>
          <p>개인 시도를 한 번 성공하면 기본 보상 자격을 얻습니다.</p>
          <p>거대어 증표는 전용 장비·미끼·칭호·꾸미기 교환에 사용합니다.</p>
        </div>
        {feedback ? <DangerousFishingFeedbackCard feedback={feedback} /> : null}
      </section>
    );
  }

  const event = model.event;
  const boss = DANGEROUS_BOSSES[event.bossId as keyof typeof DANGEROUS_BOSSES];
  const scene =
    event.bossId === "tidal_colossus"
      ? DANGEROUS_ZONES.storm_trench
      : DANGEROUS_ZONES.abyssal_rift;
  const staminaPct = Math.min(100, (event.stamina / event.maxStamina) * 100);
  const active = event.status === "active";

  if (active && model.realtimeAttempt && boss) {
    const attemptContribution = Math.min(event.stamina, boss.attemptStamina);
    return (
      <section className={`${SURFACE_CARD} space-y-3 p-4`} aria-label="실시간 거대어 개인 시도">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{event.name}</h2>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                실시간 개인 시도
              </span>
              {event.isDiscoverer ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  발견자
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              약 1~3분 · {remainingLabel(event.expiresAt, model.now)}
            </p>
          </div>
        </div>

        <div className={`${SURFACE_INSET} space-y-2 p-3`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <strong>공용 제압 현황</strong>
            <span className="font-semibold">
              {event.stamina.toLocaleString()} / {event.maxStamina.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-cyan-600 transition-[width] duration-300"
              style={{ width: `${staminaPct}%` }}
            />
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <span>내 누적 기여 {(model.contribution?.totalContribution ?? 0).toLocaleString()}</span>
            <span>이번 성공 시 기여 {attemptContribution.toLocaleString()}</span>
          </div>
        </div>

        <DangerousFishingRealtimePanel
          encounter={model.realtimeAttempt.encounter}
          scene={{
            encounterImageSrc: scene.encounterImageSrc,
            depth: "deep",
            risk: model.realtimeAttempt.encounter.config.risk,
            description: `${scene.name}의 ${boss.name} 제압 장면`,
          }}
          targetMetadata={{
            imageSrc: boss.imageSrc,
            struggleSpriteSrc: boss.struggleSpriteSrc,
            name: boss.name,
          }}
          endpointTarget={{
            kind: "boss",
            endpoint: "/api/v2/dangerous-fishing/boss",
            eventId: event.id,
          }}
          readJson={readJson}
          verification={verification}
          onFinish={onRealtimeFinish}
          feedback={feedback}
          embedded
        />
      </section>
    );
  }

  if (active && model.attempt && boss) {
    const attemptContribution = Math.min(event.stamina, boss.attemptStamina);
    return (
      <section className={`${SURFACE_CARD} space-y-3 p-4`} aria-label="비동기 거대어 개인 시도">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{event.name}</h2>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                개인 장력 시도
              </span>
              {event.isDiscoverer ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  발견자
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              약 1~3분 · {remainingLabel(event.expiresAt, model.now)}
            </p>
          </div>
        </div>

        <div className={`${SURFACE_INSET} space-y-2 p-3`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <strong>공용 제압 현황</strong>
            <span className="font-semibold">
              {event.stamina.toLocaleString()} / {event.maxStamina.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-cyan-600 transition-[width] duration-300"
              style={{ width: `${staminaPct}%` }}
            />
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <span>내 누적 기여 {(model.contribution?.totalContribution ?? 0).toLocaleString()}</span>
            <span>이번 성공 시 기여 {attemptContribution.toLocaleString()}</span>
          </div>
        </div>

        <DangerousFishingEncounterPanel
          encounter={model.attempt.encounter}
          sceneImageSrc={scene.imageSrc}
          targetImageSrc={boss.imageSrc}
          targetName={boss.name}
          busy={busy}
          feedback={feedback}
          embedded
          onAction={(action) =>
            void onAction(
              action,
              event.id,
              model.attempt!.encounter.id,
              model.attempt!.encounter.revision,
            )
          }
        />
      </section>
    );
  }

  return (
    <section className={`${SURFACE_CARD} space-y-4 p-4`} aria-label="비동기 거대어">
      {boss ? (
        <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
          <Image src={scene.imageSrc} alt="" fill sizes="(min-width: 780px) 720px, 100vw" className="object-cover" loading="eager" />
          <div className="absolute inset-2">
            <Image src={boss.imageSrc} alt={boss.name} fill sizes="(min-width: 780px) 420px, 80vw" className="object-contain drop-shadow-2xl" />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold">{event.name}</h2>
            {event.isDiscoverer ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                발견자
              </span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {active ? remainingLabel(event.expiresAt, model.now) : event.status === "defeated" ? "제압 완료" : "포착 시간 종료"}
          </p>
        </div>
        <span className="text-sm font-semibold">
          {event.stamina.toLocaleString()} / {event.maxStamina.toLocaleString()}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className="h-full rounded-full bg-cyan-600" style={{ width: `${staminaPct}%` }} />
      </div>
      <div className={`${SURFACE_INSET} grid gap-2 p-3 text-sm sm:grid-cols-2`}>
        <span>
          내 누적 기여 {(model.contribution?.totalContribution ?? 0).toLocaleString()}
        </span>
        <span>
          성공 시도 <strong>{model.contribution?.successfulAttempts ?? 0}회</strong>
        </span>
        {model.eligible ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">기본 보상 자격 확보</span>
        ) : (
          <span className="text-zinc-500">개인 시도 1회 성공 시 기본 보상</span>
        )}
        {event.isLastHaul ? (
          <span className="font-semibold text-sky-700 dark:text-sky-300">마지막 인양 기록</span>
        ) : null}
      </div>

      {active ? (
        <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs leading-5`}>
          <p>개인 시도 1회 성공 시 기본 보상 자격을 얻습니다.</p>
          <p>거대어 제압 후 낚시 코인·거대어 증표를 받을 수 있습니다.</p>
          <p>증표는 전용 장비·미끼·칭호·꾸미기 교환에 사용합니다.</p>
        </div>
      ) : null}

      {feedback ? <DangerousFishingFeedbackCard feedback={feedback} /> : null}

      {active ? (
        <div className="space-y-2">
          <Button fullWidth variant="info" disabled={busy} onClick={() => void onStart(event.id)}>
            개인 시도 시작
          </Button>
          <p className="text-center text-[11px] text-zinc-500">
            줄이 끊겨 실패해도 기존 기여는 유지되며 다시 시도할 수 있습니다.
          </p>
        </div>
      ) : event.status === "defeated" && model.eligible ? (
        <div className="space-y-2">
          {model.rewardPreview ? (
            <div className="space-y-1 text-center text-xs text-zinc-600 dark:text-zinc-300">
              <p>{model.rewardPreview.tier} · 낚시 코인 {model.rewardPreview.fishingCoins} · 증표 {model.rewardPreview.materialCount}개</p>
              <p>증표는 낚시 상점에서 최상급 장비, 칭호·영구 프로필 테두리, 특수 미끼로 교환할 수 있습니다.</p>
            </div>
          ) : null}
          <Button
            fullWidth
            variant="success"
            disabled={busy || model.claimed}
            onClick={() => void onClaim(event.id)}
          >
            {model.claimed ? "보상 수령 완료" : "보상 수령"}
          </Button>
          {onOpenShop ? (
            <Button fullWidth disabled={busy} onClick={onOpenShop}>교환 보기</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
