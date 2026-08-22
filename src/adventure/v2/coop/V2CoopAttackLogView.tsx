"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FilmStrip, Sword } from "@phosphor-icons/react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Avatar, Gender } from "@/adventure/profile/avatars";
import type { ProfileBorderId } from "@/adventure/data/v2/museunCosmetics";
import { COOP_BOSSES, type CoopBossKindId } from "@/adventure/data/v2/coopBosses";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type CoopAttackLog = {
  id: number;
  name: string;
  damageDealt: number;
  damageTaken: number;
  diedEarly: boolean;
  isMe: boolean;
  avatar: Avatar;
  profileBorder: ProfileBorderId | null;
  replay: ReplayPayload;
  at: number;
};

type AttackLogResponse =
  | { ok: true; kind: CoopBossKindId; attack: CoopAttackLog }
  | { ok?: false; error?: string };

function formatKst(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function V2CoopAttackLogView({
  sessionId,
  attackId,
  viewerGender,
  playerSubtitle,
  onBack,
}: {
  sessionId: string;
  attackId: string;
  viewerGender: Gender;
  playerSubtitle?: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<Extract<AttackLogResponse, { ok: true }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/v2/coop/${encodeURIComponent(sessionId)}/attacks/${encodeURIComponent(attackId)}`,
      );
      const json = (await res.json().catch(() => null)) as AttackLogResponse | null;
      if (res.status === 404) {
        setData(null);
        setNotFound(true);
      } else if (!res.ok || !json?.ok) {
        setData(null);
        setLoadError(true);
      } else {
        setData(json);
      }
    } catch {
      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [attackId, sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 페이지 진입 시 서버 기록을 불러온다.
    void load();
  }, [load]);

  const attack = data?.attack ?? null;
  const bossName = data ? COOP_BOSSES[data.kind].name : "협동 보스";

  return (
    <main className="mx-auto max-w-[720px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <Sword size={20} weight="duotone" className="text-rose-500" />
            협동 보스 전투 로그
          </>
        }
        onBack={onBack}
      />

      {loadError && <LoadErrorBanner onRetry={load} />}

      {loading && (
        <Card padding="md" className="text-center text-sm text-zinc-500">
          전투 기록을 불러오는 중…
        </Card>
      )}

      {!loading && notFound && (
        <Card padding="md" className="space-y-3 text-center">
          <p className="text-sm font-semibold">전투 기록을 찾을 수 없어요.</p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            토벌 화면으로 돌아가기
          </button>
        </Card>
      )}

      {!loading && attack && (
        <>
          <Card padding="md" className="ui-coop-card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CosmeticAvatar
                  avatar={attack.avatar}
                  name={attack.name}
                  profileBorder={attack.profileBorder}
                  width={48}
                  height={48}
                  sizes="48px"
                  className="h-12 w-12 rounded-xl"
                />
                <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <FilmStrip size={14} /> {bossName} 공격 기록
                </div>
                <div className="mt-1 truncate text-lg font-bold">
                  {attack.isMe ? (
                    attack.name
                  ) : (
                    <PlayerNameLink
                      name={attack.name}
                      className="text-amber-700 underline decoration-dotted underline-offset-2 dark:text-amber-300"
                    />
                  )}
                </div>
                {attack.isMe && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    내 공격
                  </span>
                )}
                </div>
              </div>
              <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                {formatKst(attack.at)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className={`${SURFACE_INSET} p-3`}>
                <div className="text-xs text-zinc-500">준 피해</div>
                <div className="mt-0.5 font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {attack.damageDealt.toLocaleString()}
                </div>
              </div>
              <div className={`${SURFACE_INSET} p-3`}>
                <div className="text-xs text-zinc-500">받은 피해</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {attack.damageTaken.toLocaleString()}
                </div>
              </div>
              <div className={`${SURFACE_INSET} col-span-2 p-3 sm:col-span-1`}>
                <div className="text-xs text-zinc-500">전투 결과</div>
                <div className="mt-0.5 font-semibold">
                  {attack.diedEarly ? "전투불능" : "공격 완료"}
                </div>
              </div>
            </div>
          </Card>

          <ReplayBattleScene
            presentation="page"
            payload={attack.replay}
            playerName={attack.name}
            gender={attack.avatar ?? (attack.isMe ? viewerGender : "male1")}
            profileBorder={attack.profileBorder}
            exp={0}
            maxExp={1}
            playerSubtitle={attack.isMe ? playerSubtitle : undefined}
          />

          <Button onClick={onBack} variant="secondary" size="md" fullWidth>
            <ArrowLeft size={18} weight="bold" />
            토벌 화면으로 돌아가기
          </Button>
        </>
      )}
    </main>
  );
}
