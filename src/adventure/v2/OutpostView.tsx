"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { TabBar } from "@/components/ui/TabBar";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Outpost } from "@/adventure/data/v2/types";
import { OUTPOST_NPC_TAX_RATE, terrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  TERRAIN_TRAIT_NAME,
  TRAIT_BONUS_KIND,
  TRAIT_BONUS_PCT,
  PRODUCTION_KIND_NAME,
  terrainTraitDesc,
} from "@/adventure/data/v2/settlement";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import {
  SIEGE_DAMAGE_PER_WIN,
  siegeWinsToFall,
} from "@/adventure/data/v2/outpostSiege";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import { OutpostAttackLog } from "./OutpostAttackLog";
import { ClaimResultCard, type ClaimResult } from "./ClaimResultCard";
import { V2VillagePanel } from "./V2VillagePanel";
import DefendPanel from "./DefendPanel";
import { useGameState } from "./GameStateProvider";
import { V2_SETTLEMENT_WARFARE } from "@/adventure/data/v2/settlementWarfareConfig";

// 라이브 TownScreen 의 메뉴 카드 UI 패턴을 v2 거점에 적용.
// 거점 hub — 진입 시 그 거점에서 할 수 있는 활동 리스트.
// 옛 type(요새/마탑/광산/마을)은 표면 라벨 폐기 → 지형 특성(평지/숲/광맥/어장)으로 표기.

// 던전 입장은 전투 탭으로 이동 (V2BattleHome) — OutpostView 에서는 outpost 자체
// 활동(claim/harvest/policy/병사 모집 등) 만.
export type OutpostAction =
  | { kind: "back" }
  | { kind: "claimed" };

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  policy?: string;
  taxRate?: string;
  nextAttackAt?: string;
  // 거점 공성(성벽 HP) — 재생 반영 현재값 + 보호막 만료.
  fortHp?: number;
  fortMaxHp?: number;
  protectedUntil?: string;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 덮는다.
  villageName?: string | null;
} | null;

export function OutpostView({
  outpost,
  viewerUserId,
  viewerGuildId,
  occupation,
  treasuryGold = 0,
  onAction,
}: {
  outpost: Outpost;
  viewerUserId: string | null;
  viewerGuildId: number | null;
  occupation: OccupationLite;
  // 거점 금고 잔액 — 점령/함락 시 자동 회수되는 점령 유인(occupations GET 동봉).
  treasuryGold?: number;
  onAction: (action: OutpostAction) => void;
}) {
  // 코어루프 on = 스태미나 폐지(점령은 골드 비용). 안내 문구의 "스태미너 소모" 분기.
  const { coreLoopOn } = useGameState();
  const [busy, setBusy] = useState(false);
  // 내 거점 활동 탭 — 생산 / 최근 공격 기록 / (마스터·부마스터) 관리.
  const [activityTab, setActivityTab] = useState<
    "produce" | "attacks" | "manage" | "defend"
  >("produce");
  const [lastClaimResult, setLastClaimResult] = useState<ClaimResult | null>(
    null,
  );
  // 정착지 전쟁 약탈(raid) 결과 — 성공/실패 + 탈취 골드(또는 에러 문자열). 플래그 on 일 때만 사용.
  const [raidResult, setRaidResult] = useState<
    { won: boolean; stolenGold: number; defenderName: string | null } | string | null
  >(null);
  // 내 합성 전투력(derivePowerScore) — 수비 전투력 게이트 비교용. state 라우트서 1회 로드.
  // intrusion(침입 상태)도 같은 응답에서 — "이 거점에 침입 중" 배너용.
  const [viewerPower, setViewerPower] = useState<number | null>(null);
  const [intrusionOutpostId, setIntrusionOutpostId] = useState<string | null>(
    null,
  );
  // 내 길드 직책 — 정착지 관리 탭(마스터/부마스터 전용) 게이트. 같은 응답에서.
  const [guildRole, setGuildRole] = useState<string | null>(null);
  const [guildIsMaster, setGuildIsMaster] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (typeof j?.combat?.power === "number") {
          setViewerPower(j.combat.power);
        }
        setIntrusionOutpostId(
          typeof j?.intrusion?.outpostId === "string"
            ? j.intrusion.outpostId
            : null,
        );
        setGuildRole(typeof j?.guild?.role === "string" ? j.guild.role : null);
        setGuildIsMaster(j?.guild?.isMaster === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 거점 수비 전투력 (tier 정적값 1500~5000, 분쟁지대·중립은 0=게이트 없음).
  const defensePower = outpostDefensePower(outpost);

  // 라인업 미설정 경고 — 적대 길드 점령 거점(공성=3:3 토너먼트 가능)에서 내가 2인+ 길드
  // 소속인데 라인업이 없으면, 마스터 단독 출전 폴백(fetchLineupCandidates)을 미리 알린다.
  const enemyGuildSiege =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId != null &&
    occupation.occupiedByGuildId !== viewerGuildId;
  const [lineupWarning, setLineupWarning] = useState(false);
  useEffect(() => {
    if (!enemyGuildSiege) return;
    let alive = true;
    fetch("/api/v2/guild/me/lineup")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (j: {
          ok?: boolean;
          members?: unknown[];
          lineup?: string[] | null;
        } | null) => {
          if (!alive || !j?.ok) return;
          const memberCount = j.members?.length ?? 0;
          const lineupCount = j.lineup?.length ?? 0;
          setLineupWarning(memberCount >= 2 && lineupCount < 2);
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enemyGuildSiege]);

  const claimDisabled = computeClaimDisabled(
    outpost,
    occupation,
    viewerUserId,
    defensePower,
    viewerPower,
  );
  const isOwner =
    !!occupation &&
    !!viewerUserId &&
    occupation.occupiedByUserId === viewerUserId;
  // 점령 길드 멤버 — 공격 기록 패널 가시 조건. user 본인 점령이 아니어도
  // 같은 길드 멤버라면 열람 가능. (침입자 토벌은 전투 탭 > 토벌로 이관.)
  const isGuildMember =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId === occupation.occupiedByGuildId;
  // 내 거점(내가 점령했거나 우리 길드 소유) — 점령/공성 시도 카드를 숨기고 생산/공격기록 탭.
  const ownByMyGuild = isOwner || isGuildMember;
  // 정착지 관리(건설·이름변경·칸 해금·단계 업그레이드) = 점령 길드의 마스터/부마스터만(관리 탭).
  //   role 'vice_master' 는 guildAdmin 의 GUILD_ROLE_VICE_MASTER 와 동일(클라라 문자열 직접 비교).
  const canManageSettlement =
    isGuildMember && (guildIsMaster || guildRole === "vice_master");
  // 거점 지형 특성 — 옛 type 라벨 대신 헤더에 표기(맞는 생산물 +보너스).
  const trait = terrainTraitOf(outpost.id);

  // 정책 게이트 — guild-only 거점에 다른 길드가 들어가려는 경우 던전 입장 막음.
  const entryDecision = occupation
    ? evaluateOutpostEntry({
        policy: occupation.policy ?? "open",
        occupiedByGuildId: occupation.occupiedByGuildId,
        viewerGuildId,
      })
    : { allowed: true as const, charge: "none" as const };
  const dungeonDisabled: { reason: string } | null = entryDecision.allowed
    ? null
    : { reason: "점령 길드가 자길드 멤버에게만 개방 중" };

  async function attemptClaim() {
    setBusy(true);
    setLastClaimResult(null);
    try {
      const res = await fetch("/api/v2/outpost/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      let json: ClaimResult | null = null;
      try {
        json = (await res.json()) as ClaimResult;
      } catch {
        setLastClaimResult({
          ok: false,
          error: `http ${res.status} (응답 JSON 아님)`,
        });
        return;
      }
      if (!json) {
        setLastClaimResult({
          ok: false,
          error: `http ${res.status} (빈 응답)`,
        });
        return;
      }
      // 수비 전투력 부족 — 필요/현재 전투력으로 친절한 메시지 (서버가 race 등으로 막은 경우).
      const raw = json as ClaimResult & {
        requiredPower?: number;
        playerPower?: number;
      };
      if (!raw.ok && raw.error === "insufficient_power") {
        setLastClaimResult({
          ok: false,
          error: `수비 전투력 ${(raw.requiredPower ?? 0).toLocaleString()} 필요 — 내 전투력 ${(raw.playerPower ?? 0).toLocaleString()}`,
        });
        return;
      }
      if (!raw.ok && raw.error === "not_adjacent") {
        setLastClaimResult({
          ok: false,
          error: "현재 거점 또는 인접 1칸 거점만 공격할 수 있습니다",
        });
        return;
      }
      setLastClaimResult(json);
      // 점령 성공 또는 PvP 패배(자원/점령 변동 가능) → refresh.
      if (json.ok && (json.won || json.pvp)) {
        onAction({ kind: "claimed" });
      }
    } catch (err) {
      setLastClaimResult({
        ok: false,
        error: `network: ${(err as Error).message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  // 정착지 전쟁 약탈 — 수비 큐 1번과 건강도 결투 → 승리 시 금고 50% 탈취(점령 X). 플래그 on 전용.
  async function attemptRaid() {
    setBusy(true);
    setRaidResult(null);
    try {
      const res = await fetch("/api/v2/outpost/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id, mode: "raid" }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; won: boolean; stolenGold: number; defenderName: string | null }
        | { ok: false; error: string }
        | null;
      if (!json) {
        setRaidResult(`응답 오류 (http ${res.status})`);
        return;
      }
      if (!json.ok) {
        setRaidResult(raidErrorMsg(json.error));
        return;
      }
      setRaidResult({
        won: json.won,
        stolenGold: json.stolenGold,
        defenderName: json.defenderName,
      });
    } catch (err) {
      setRaidResult(`network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={occupation?.villageName?.trim() || outpost.name}
        onBack={() => onAction({ kind: "back" })}
      />
      {/* 거점 상태(특성·점령·금고·세율·성벽) — 제목은 위 헤더로 빠지고 여기엔 상태만. */}
      <HeaderPanel className="space-y-2">
        <div className="flex flex-wrap gap-1 text-xs">
          <Tooltip
            content={`${TERRAIN_TRAIT_NAME[trait]} — ${terrainTraitDesc(trait)}`}
            align="start"
            className="shrink-0"
            triggerClassName="rounded bg-amber-200 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
          >
            {TERRAIN_TRAIT_NAME[trait]}
            {TRAIT_BONUS_KIND[trait] && (
              <>
                {" · "}
                {PRODUCTION_KIND_NAME[TRAIT_BONUS_KIND[trait]!]} +{TRAIT_BONUS_PCT}%
              </>
            )}
          </Tooltip>
          {outpost.neutral && (
            <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
              절대 중립
            </span>
          )}
          {occupation && isOwner && (
            <span className="rounded bg-emerald-500 px-2 py-0.5 text-white">
              내 점령
            </span>
          )}
          {occupation && !isOwner && isGuildMember && (
            <span className="rounded bg-emerald-500 px-2 py-0.5 text-white">
              우리 길드 점령
            </span>
          )}
          {occupation &&
            occupation.occupiedByUserId !== null &&
            !isOwner &&
            !isGuildMember && (
              <span className="rounded bg-red-500 px-2 py-0.5 text-white">
                적대 점령
              </span>
            )}
          {(treasuryGold ?? 0) > 0 && (
            <span className="rounded bg-yellow-400/20 px-2 py-0.5 font-medium tabular-nums text-yellow-700 dark:text-yellow-400">
              금고 {treasuryGold.toLocaleString()} G
            </span>
          )}
          {/* 세율 상시 표기 — 사냥 골드에서 떼어가는 비율. 점령 거점은 점령자 설정값,
              미점령은 NPC 고정 세율(거점 금고 적립). 같은 길드 멤버는 실제론 면제. */}
          <span className="rounded bg-zinc-200 px-2 py-0.5 tabular-nums dark:bg-zinc-800">
            세율{" "}
            {occupation?.occupiedByUserId
              ? Math.round(Number(occupation.taxRate ?? "0") * 100)
              : Math.round(OUTPOST_NPC_TAX_RATE * 100)}
            %
          </span>
        </div>
        {outpost.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {outpost.description}
          </p>
        )}
        {defensePower > 0 && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            수비 전투력{" "}
            <strong className="tabular-nums">
              {defensePower.toLocaleString()}
            </strong>
            {viewerPower != null && (
              <span
                className={
                  "ml-1 " +
                  (viewerPower < defensePower
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400")
                }
              >
                · 내 전투력{" "}
                <span className="tabular-nums">
                  {viewerPower.toLocaleString()}
                </span>
              </span>
            )}
          </p>
        )}
        {occupation &&
          occupation.fortHp != null &&
          occupation.fortMaxHp != null && (
            <FortBar
              fortHp={occupation.fortHp}
              fortMaxHp={occupation.fortMaxHp}
              protectedUntil={occupation.protectedUntil}
            />
          )}
        {isOwner && occupation?.nextAttackAt && (
          <NextAttackInfo nextAttackAt={occupation.nextAttackAt} />
        )}
      </HeaderPanel>

      <section className="space-y-2">
        {dungeonDisabled && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {dungeonDisabled.reason} — 사냥 불가
          </div>
        )}

        {/* 침입자 본인 상태 — 다른 길드 점령 거점에서 사냥한 TTL 내. 점령 길드의
            토벌 대상임을 본인도 알게(전쟁의 "당하는 쪽" 가시화, PR-5). */}
        {intrusionOutpostId === outpost.id && enemyGuildSiege && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
            🗡 이 거점에 침입 중 — 점령 길드가 당신을 토벌할 수 있습니다
          </div>
        )}

        {ownByMyGuild ? (
          // 내 거점 — 생산 / 최근 공격 기록 (+ 마스터·부마스터면 관리) 탭.
          <>
            <HeaderPanel className="py-2">
              <TabBar
                tabs={[
                  { key: "produce", label: "생산" },
                  ...(V2_SETTLEMENT_WARFARE
                    ? [{ key: "defend", label: "수비" }]
                    : []),
                  { key: "attacks", label: "최근 공격 기록" },
                  ...(canManageSettlement
                    ? [{ key: "manage", label: "관리" }]
                    : []),
                ]}
                active={activityTab}
                onChange={(k) =>
                  setActivityTab(
                    k as "produce" | "attacks" | "manage" | "defend",
                  )
                }
                ariaLabel="거점 활동 탭"
                size="sm"
                variant="highlight"
              />
            </HeaderPanel>
            {activityTab === "produce" && (
              <V2VillagePanel outpostId={outpost.id} mode="produce" />
            )}
            {activityTab === "defend" && V2_SETTLEMENT_WARFARE && (
              <DefendPanel outpostId={outpost.id} />
            )}
            {activityTab === "attacks" && (
              <OutpostAttackLog outpostId={outpost.id} />
            )}
            {activityTab === "manage" && canManageSettlement && (
              <V2VillagePanel outpostId={outpost.id} mode="manage" />
            )}
          </>
        ) : (
          // 비-소유 — 점령/공성 시도.
          <>
            <HeaderPanel className="py-3">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                여기서 할 수 있는 것
              </div>
            </HeaderPanel>
            {lineupWarning && !claimDisabled && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                ⚠️ 3:3 라인업 미설정 — 공성 시 마스터 혼자 출전합니다. 길드 탭
                길드원에서 라인업을 설정하세요.
              </div>
            )}
            <ActionCard
              title={
                claimDisabled
                  ? "점령 시도"
                  : occupation
                    ? "공성 시도 (PvP 결투)"
                    : "점령 시도 (NPC 일기토)"
              }
              subtitle={
                claimDisabled?.reason ??
                (occupation
                  ? `점령자와 1대1 결투 — 승리 시 성벽을 깎고, 0이 되면 함락${coreLoopOn ? "" : " (스태미너 소모)"}.`
                  : `거점 NPC 영웅과 1대1 결투. 승리 시 점령${coreLoopOn ? "" : " (스태미너 소모)"}.`)
              }
              onClick={attemptClaim}
              disabled={!!claimDisabled || busy}
              loading={busy}
            />
            {/* 정착지 전쟁 약탈 — 적 길드 점령 거점만(NPC 거점 제외). 플래그 on 전용. */}
            {V2_SETTLEMENT_WARFARE && occupation?.occupiedByGuildId != null && (
              <ActionCard
                title="약탈 시도"
                subtitle="수비대 1번과 건강도 결투 — 승리 시 거점 금고 50% 탈취(점령은 안 함). 수비대가 없으면 무혈 약탈."
                onClick={attemptRaid}
                disabled={busy}
                loading={busy}
              />
            )}
          </>
        )}

        {/* 점령 결과 — 탭 분기 밖(점령 성공 시 내 거점으로 전환돼도 결과 카드 유지). */}
        {lastClaimResult && (
          <ClaimResultCard
            result={lastClaimResult}
            outpostName={occupation?.villageName?.trim() || outpost.name}
            onClose={() => setLastClaimResult(null)}
            coreLoopOn={coreLoopOn}
          />
        )}
        {raidResult && (
          <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            {typeof raidResult === "string" ? (
              <span className="text-rose-600 dark:text-rose-400">
                {raidResult}
              </span>
            ) : raidResult.won ? (
              <span>
                약탈 성공! <strong>{raidResult.stolenGold.toLocaleString()} 골드</strong>{" "}
                탈취
                {raidResult.defenderName
                  ? ` — 수비자 ${raidResult.defenderName} 격파`
                  : " (무방비 거점)"}
              </span>
            ) : (
              <span>
                약탈 실패 — 수비자
                {raidResult.defenderName ? ` ${raidResult.defenderName}` : ""}에게
                패배. 건강도를 회복하고 다시 시도하세요.
              </span>
            )}
            <button
              type="button"
              onClick={() => setRaidResult(null)}
              className="ml-2 text-xs text-zinc-500 underline"
            >
              닫기
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

// 약탈 라우트 에러 코드 → 사용자 메시지.
function raidErrorMsg(error: string): string {
  switch (error) {
    case "no_guild":
      return "길드에 소속돼야 약탈할 수 있습니다";
    case "not_occupied":
      return "점령되지 않은 거점은 약탈할 수 없습니다";
    case "already_yours":
      return "내 길드 거점입니다";
    case "protected":
      return "함락 직후 보호막 — 잠시 후 가능";
    case "no_character":
      return "캐릭터 정보를 찾을 수 없습니다";
    case "disabled":
      return "약탈 기능이 비활성화돼 있습니다";
    default:
      return `약탈 실패 (${error})`;
  }
}

function computeClaimDisabled(
  outpost: Outpost,
  occupation: OccupationLite,
  viewerUserId: string | null,
  defensePower: number,
  viewerPower: number | null,
): { reason: string } | null {
  if (outpost.neutral) return { reason: "절대 중립 거점 (점령 불가)" };
  if (
    occupation &&
    viewerUserId &&
    occupation.occupiedByUserId === viewerUserId
  ) {
    return { reason: "이미 내 점령지" };
  }
  // 함락 직후 보호막 — 재공성 불가(핑퐁 방지).
  if (
    occupation?.protectedUntil &&
    new Date(occupation.protectedUntil).getTime() > Date.now()
  ) {
    return { reason: "함락 직후 보호막 — 잠시 후 공성 가능" };
  }
  // 수비 전투력 게이트 — 내 전투력이 거점 수비 전투력에 못 미치면 시도 불가.
  // viewerPower 로딩 전(null)엔 막지 않는다(서버가 권위로 한 번 더 차단).
  if (defensePower > 0 && viewerPower != null && viewerPower < defensePower) {
    return {
      reason: `수비 전투력 ${defensePower.toLocaleString()} 필요 (내 전투력 ${viewerPower.toLocaleString()})`,
    };
  }
  return null; // 비점령(NPC 일기토) 또는 다른 세력 점령(PvP 결투) 시도 가능
}

// 성벽 HP 바 — 점령된 거점의 공성 진행도. 0 이 되면 함락. 보호막 활성 시 배지 표시.
function FortBar({
  fortHp,
  fortMaxHp,
  protectedUntil,
}: {
  fortHp: number;
  fortMaxHp: number;
  protectedUntil?: string;
}) {
  // 마운트 시각 기준(보호막은 시간 단위라 라이브 틱 불요) — 렌더 중 Date.now() 직접 호출 회피.
  const [nowMs] = useState(() => Date.now());
  const pct = Math.max(0, Math.min(100, Math.round((fortHp / fortMaxHp) * 100)));
  const protectedMsLeft = protectedUntil
    ? new Date(protectedUntil).getTime() - nowMs
    : 0;
  const isProtected = protectedMsLeft > 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
        <span>
          성벽 <strong className="tabular-nums">{fortHp}</strong> / {fortMaxHp}
        </span>
        {isProtected && (
          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
            보호막 ~{Math.ceil(protectedMsLeft / 3_600_000)}시간
          </span>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* 공성 메커니즘 명문화 — 1승당 데미지와 함락까지 남은 승수(재생 무시 근사). */}
      <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        공성 1승당 −{SIEGE_DAMAGE_PER_WIN} · 약 {siegeWinsToFall(fortHp)}
        승이면 함락
      </div>
    </div>
  );
}

function NextAttackInfo({ nextAttackAt }: { nextAttackAt: string }) {
  const targetMs = new Date(nextAttackAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const diffMs = targetMs - now;
  const overdue = diffMs <= 0;
  const totalMin = Math.max(0, Math.floor(diffMs / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  return (
    <div className="rounded border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-zinc-500">다음 NPC 공격: </span>
      <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
        {overdue ? "곧 (cron 처리 대기)" : `${h}시간 ${m}분 후`}
      </span>
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  onClick,
  disabled,
  loading,
}: {
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: { reason: string } | boolean;
  loading?: boolean;
}) {
  const isDisabled = !!disabled;
  const reason = typeof disabled === "object" ? disabled.reason : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="block w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
    >
      <div className="font-medium">
        {title}
        {loading && <span className="ml-2 text-xs text-zinc-500">…</span>}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{reason ?? subtitle}</div>
    </button>
  );
}
