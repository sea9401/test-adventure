"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Outpost } from "@/adventure/data/v2/types";
import { OUTPOST_NPC_TAX_RATE, terrainTraitOf } from "@/adventure/data/v2/outposts";
import {
  TERRAIN_TRAIT_NAME,
  terrainTraitDesc,
} from "@/adventure/data/v2/settlement";
import { evaluateOutpostEntry } from "@/adventure/data/v2/outpostPolicy";
import { outpostDefensePower } from "@/adventure/data/v2/outpostDefense";
import { FORT_HP_PER_REPAIR_KIT } from "@/adventure/data/v2/outpostSiege";
import { WALL_REPAIR_KIT_ID } from "@/adventure/data/v2/settlementMaterials";
import { type ClaimResult } from "./ClaimResultCard";
import { useGameState } from "./GameStateProvider";
import {
  OutpostActivityTabs,
  type ActivityTab,
} from "./outpost/OutpostActivityTabs";
import { OutpostAttackPanel } from "./outpost/OutpostAttackPanel";
import { OutpostResultCards } from "./outpost/OutpostResultCards";
import type {
  OccupationLite,
  RaidResult,
  ConquestResult,
} from "./outpost/types";
import {
  RAID_MIN_TILE_STAY_MS,
  V2_SETTLEMENT_WARFARE,
} from "@/adventure/data/v2/settlementWarfareConfig";
import type { WarVigor } from "@/adventure/data/v2/warVigor";
import {
  isTileOutpostId,
  parseTileOutpostId,
  isTileAdjacentToNeutralOutpost,
} from "@/adventure/data/v2/tileWarfare";
import {
  areOutpostsAdjacent,
  resolveCurrentOutpostId,
} from "@/adventure/data/v2/outpostGraph";
import { areTilesAdjacent4 } from "@/adventure/data/v2/tileConfig";
import { guildColorHex } from "@/adventure/data/guild-colors";

// 라이브 TownScreen 의 메뉴 카드 UI 패턴을 v2 거점에 적용.
// 거점 hub — 진입 시 그 거점에서 할 수 있는 활동 리스트.
// 옛 type(요새/마탑/광산/마을)은 표면 라벨 폐기 → 지형 특성(평지/숲/광맥/어장)으로 표기.

// 던전 입장은 전투 탭으로 이동 (V2BattleHome) — OutpostView 에서는 outpost 자체
// 활동(claim/harvest/policy/병사 모집 등) 만.
export type OutpostAction =
  | { kind: "back" }
  | { kind: "claimed" }
  | { kind: "policy-changed" };

function useClientNowMs(refreshMs = 30_000): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  return nowMs;
}

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
  // currentOutpost/tilePos/tileSettlements = 현재 위치 게이트(점령/약탈/정복)의 클라 입력.
  const { coreLoopOn, currentOutpost, tilePos, setTilePos, tileSettlements } =
    useGameState();
  const nowMs = useClientNowMs();
  const [busy, setBusy] = useState(false);
  // 내 거점 활동 탭 — 마을 / 대장간 / 수비 / 최근 공격 기록.
  const [activityTab, setActivityTab] = useState<ActivityTab>("manage");
  const [lastClaimResult, setLastClaimResult] = useState<ClaimResult | null>(
    null,
  );
  // 정착지 전쟁 약탈(raid) 결과 — 성공/실패 + 탈취 골드(또는 에러 문자열). 플래그 on 일 때만 사용.
  const [raidResult, setRaidResult] = useState<RaidResult | null>(null);
  // 정착지 전쟁 정복(conquest) 결과 — 함락/공성 진행/실패(또는 에러 문자열). 플래그 on 전용.
  const [conquestResult, setConquestResult] = useState<ConquestResult | null>(
    null,
  );
  // 내 합성 전투력(derivePowerScore) — 수비 전투력 게이트 비교용. state 라우트서 1회 로드.
  // intrusion(침입 상태)도 같은 응답에서 — "이 거점에 침입 중" 배너용.
  const [viewerPower, setViewerPower] = useState<number | null>(null);
  const [intrusionOutpostId, setIntrusionOutpostId] = useState<string | null>(
    null,
  );
  // 내 길드 직책 — 정착지 관리 탭(마스터/부마스터 전용) 게이트. 같은 응답에서.
  const [guildRole, setGuildRole] = useState<string | null>(null);
  const [guildIsMaster, setGuildIsMaster] = useState(false);
  // 영주(거점 1인) + 거점 금고(쌓인 세금) — 헤더 표기용. lord GET 에서 둘 다(없으면 null).
  const [lordInfo, setLordInfo] = useState<{
    lordName: string | null;
    treasury: number;
  } | null>(null);
  // 약탈/정복 직후 "최근 공격 기록" 패널 재조회 트리거 — bump 하면 OutpostAttackLog 가 refetch.
  const [attackLogReload, setAttackLogReload] = useState(0);
  // 성벽 수동 수리 — 진행 상태 + 결과 메시지(성공/실패). 점령 길드 멤버 전용.
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  // 성벽 수리 키트 보유수 — /me/inventory 로 초기화, 수리 응답으로 갱신. 키트 조합은 대장간(조합소).
  const [repairKits, setRepairKits] = useState(0);
  const [warVigor, setWarVigor] = useState<WarVigor | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/inventory")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const m = (j?.materials ?? {}) as Record<string, number>;
        setRepairKits(Number(m[WALL_REPAIR_KIT_ID]) || 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!V2_SETTLEMENT_WARFARE) return;
    let alive = true;
    fetch("/api/v2/me/war-vigor/recover", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; warVigor?: WarVigor } | null) => {
        if (alive && j?.ok && j.warVigor) setWarVigor(j.warVigor);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
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

  // 영주 + 거점 금고(세금) — 점령된 거점만. lord GET 은 멤버 게이트 없이 남의 길드 거점도
  //   영주명·세금을 공개(스카우팅 정보). 세금도 이 응답값을 써 모든 거점에 표기. 설전 off 면 404 → null.
  useEffect(() => {
    if (!occupation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 점령 해제/미점령 상태는 영주 요약 clear
      setLordInfo(null);
      return;
    }
    let alive = true;
    fetch(`/api/v2/outpost/lord?outpostId=${encodeURIComponent(outpost.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        setLordInfo(
          j?.ok
            ? {
                lordName: j.lord?.name ?? null,
                treasury: Math.max(0, Number(j.treasuryGold ?? 0)),
              }
            : null,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [occupation, outpost.id]);

  // 거점 수비 전투력 (tier 정적값 1500~5000, 분쟁지대·중립은 0=게이트 없음).
  const defensePower = outpostDefensePower(outpost);

  // 적대 길드가 점령 중인 거점인지 — 침입자 토벌 대상 안내(아래 침입 배지)에 쓰인다.
  const enemyGuildSiege =
    !!occupation &&
    occupation.occupiedByGuildId != null &&
    viewerGuildId != null &&
    occupation.occupiedByGuildId !== viewerGuildId;

  // === 현재 위치 게이트 — 서버(claim/attack 라우트)의 위치·인접 규칙을 버튼에 미리 반영.
  //   멀리 떨어진 거점은 버튼을 비활성화하고 사유를 보여준다(지금은 클릭 후 서버 에러). 서버와
  //   동일 헬퍼·동일 판정을 쓰며 서버가 최종 권위. 타일 좌표 못 푸는 카탈로그 거점(targetTilePos
  //   null)은 약탈/정복의 서버 위치 게이트 적용 대상이 아니라 통과시킨다.
  const targetTilePos = parseTileOutpostId(outpost.id); // 타일=｛col,row｝, 카탈로그=null
  // 점령(claim) = 현재 머무는 거점 또는 그 인접 1칸(claim 라우트 not_adjacent 미러).
  const attackerLocId = resolveCurrentOutpostId(currentOutpost?.id);
  const claimInRange =
    attackerLocId === outpost.id ||
    areOutpostsAdjacent(attackerLocId, outpost.id);
  // 약탈(raid) = 대상 타일 칸에 직접 서 있어야(attack 라우트 not_present 미러).
  const raidOutOfRange =
    targetTilePos != null &&
    (tilePos == null ||
      tilePos.col !== targetTilePos.col ||
      tilePos.row !== targetTilePos.row);
  const raidStayElapsedMs =
    targetTilePos != null &&
    tilePos != null &&
    tilePos.col === targetTilePos.col &&
    tilePos.row === targetTilePos.row &&
    typeof tilePos.at === "number" &&
    nowMs != null
      ? Math.max(0, nowMs - tilePos.at)
      : 0;
  const standingOnTargetTile =
    targetTilePos != null &&
    tilePos != null &&
    tilePos.col === targetTilePos.col &&
    tilePos.row === targetTilePos.row;
  const tileIntrusionActive = enemyGuildSiege && standingOnTargetTile;
  const tileRaidReady =
    tileIntrusionActive && raidStayElapsedMs >= RAID_MIN_TILE_STAY_MS;
  const raidDisabled = raidOutOfRange
    ? {
        reason:
          "이 정착지 칸으로 이동해야 약탈할 수 있어요 — 지도에서 해당 칸으로 이동하세요.",
      }
    : targetTilePos != null && raidStayElapsedMs < RAID_MIN_TILE_STAY_MS
      ? {
          reason: `이 정착지 칸에서 ${formatRemainingMinutes(
            RAID_MIN_TILE_STAY_MS - raidStayElapsedMs,
          )} 더 버텨야 약탈할 수 있습니다.`,
        }
      : null;
  // 정복(conquest) = 내 길드 영지에 4방향 인접한 칸(연속 확장)·땅 없으면 중립 거점 인접 발판
  //   (attack 라우트 no_foothold 미러 — 서버 guildTileFoothold 를 클라 tileSettlements 로 재구성).
  const myGuildTiles =
    viewerGuildId == null
      ? []
      : tileSettlements.filter((s) => s.guildId === viewerGuildId);
  const conquerOutOfRange =
    targetTilePos != null &&
    !(
      myGuildTiles.some((s) =>
        areTilesAdjacent4(s.col, s.row, targetTilePos.col, targetTilePos.row),
      ) ||
      (myGuildTiles.length === 0 &&
        isTileAdjacentToNeutralOutpost(targetTilePos.col, targetTilePos.row))
    );

  const claimDisabled = computeClaimDisabled(
    outpost,
    occupation,
    viewerUserId,
    defensePower,
    viewerPower,
    claimInRange,
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
  // 내 거점(내가 점령했거나 우리 길드 소유) — 점령/공성 시도 카드를 숨기고 영지 활동 탭.
  const ownByMyGuild = isOwner || isGuildMember;
  // 정착지/거점 활동 탭 노출 = 우리 길드 소유(점령). 영토=길드 소유라 솔로 소유 경로는 폐기.
  const ownSettlement = ownByMyGuild;
  // 정착지 관리(건설·이름변경·칸 해금·단계 업그레이드) = 점령 길드의 마스터/부마스터.
  //   role 'vice_master' 는 guildAdmin 의 GUILD_ROLE_VICE_MASTER 와 동일(클라라 문자열 직접 비교).
  const canManageSettlement =
    isGuildMember && (guildIsMaster || guildRole === "vice_master");
  // 비-소유자가 정복할 수 있는 대상인가 — 타일이면 누구나(솔로/길드 영지 무관), 카탈로그 정적
  //   거점은 철거(빈땅) 불가라 길드 viewer + 길드 점령만. occupation 없으면 불가. (비-소유 브랜치 전용)
  const isTile = isTileOutpostId(outpost.id);
  // 정복=전쟁 행위라 길드 viewer 만(영토=길드 소유). 타일(솔로 잔존 포함)·길드 점령 카탈로그 대상.
  const showConquer =
    V2_SETTLEMENT_WARFARE &&
    occupation != null &&
    viewerGuildId != null &&
    (isTile || occupation.occupiedByGuildId != null);
  // 길드 viewer 만 정복 가능 → 함락=항상 인수(소유 이전). 옛 솔로 viewer 철거 경로 폐기.
  const conquerRazes = false;
  // 거점 지형 특성 — 옛 type 라벨 대신 헤더에 표기(맞는 생산물 +보너스).
  const trait = terrainTraitOf(outpost.id);
  const occupationGuildColor =
    occupation?.occupiedByGuildId != null
      ? guildColorHex(occupation.occupiedByGuildColor ?? null)
      : null;

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
        | {
            ok: true;
            won: boolean;
            stolenGold: number;
            defenderName: string | null;
            tilePos?: { col: number; row: number; at?: number } | null;
          }
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
      if (json.tilePos) {
        setTilePos(json.tilePos);
      }
      // 금고 탈취·수비 큐 변동 반영 — 부모 거점 상태(금고/소유) 재조회 + 공격 기록 패널 갱신.
      onAction({ kind: "claimed" });
      setAttackLogReload((n) => n + 1);
    } catch (err) {
      setRaidResult(`network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // 정착지 전쟁 정복 — 수비 큐 전원 격파 + 성벽 누적 공성 → 함락 시 마을 1단계 강등·소유 이관. 플래그 on 전용.
  async function attemptConquest() {
    setBusy(true);
    setConquestResult(null);
    try {
      const res = await fetch("/api/v2/outpost/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id, mode: "conquest" }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok: true;
            clearedQueue: boolean;
            captured: boolean;
            razed: boolean;
            fortHp: number;
            fortMaxHp: number;
            downgradedTo: string | null;
            defendersDefeated: number;
          }
        | { ok: false; error: string }
        | null;
      if (!json) {
        setConquestResult(`응답 오류 (http ${res.status})`);
        return;
      }
      if (!json.ok) {
        setConquestResult(raidErrorMsg(json.error));
        return;
      }
      setConquestResult({
        clearedQueue: json.clearedQueue,
        captured: json.captured,
        razed: json.razed,
        fortHp: json.fortHp,
        fortMaxHp: json.fortMaxHp,
        downgradedTo: json.downgradedTo,
        defendersDefeated: json.defendersDefeated,
      });
      // 부모 거점 상태(성벽 HP·소유·금고) 재조회 — 공성 진행/함락이 헤더 성벽바에 즉시 반영되게.
      //   + 공격 기록 패널 갱신(방금 시도 1건 노출). 옛 "재진입 시 반영" 갭 해소.
      onAction({ kind: "claimed" });
      setAttackLogReload((n) => n + 1);
    } catch (err) {
      setConquestResult(`network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // 성벽 수동 수리 — 점령 길드원이 본인 인벤의 성벽 수리 키트로 결손분 보강(키트 1개=+100 HP).
  //   옛 골드 수리 폐지 대체(능동 방어). 키트가 곧 방어 비용.
  async function attemptRepair() {
    setRepairing(true);
    setRepairResult(null);
    try {
      const res = await fetch("/api/v2/outpost/repair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId: outpost.id }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok: true;
            fortHp: number;
            fortMaxHp: number;
            repairedHp: number;
            kitsSpent: number;
            kitsLeft: number;
          }
        | { ok: false; error: string }
        | null;
      if (!json) {
        setRepairResult(`응답 오류 (http ${res.status})`);
        return;
      }
      if (!json.ok) {
        setRepairResult(raidErrorMsg(json.error));
        return;
      }
      setRepairKits(json.kitsLeft);
      if (json.repairedHp > 0) {
        setRepairResult(
          `성벽 +${json.repairedHp.toLocaleString()} 수리 (수리 키트 ${json.kitsSpent}개 소비 · 남은 키트 ${json.kitsLeft}개)`,
        );
      } else {
        setRepairResult(
          json.fortHp >= json.fortMaxHp
            ? "이미 성벽이 가득 찼습니다."
            : "성벽 수리 키트가 없습니다 — 통나무·철광석으로 조합하세요.",
        );
      }
      // 성벽 HP 갱신을 헤더 바에 즉시 반영.
      onAction({ kind: "claimed" });
    } catch (err) {
      setRepairResult(`network: ${(err as Error).message}`);
    } finally {
      setRepairing(false);
    }
  }


  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={occupation?.villageName?.trim() || outpost.name}
        onBack={() => onAction({ kind: "back" })}
      />
      {/* 거점 상태(특성·점령·금고·세율·성벽) — 제목은 위 헤더로 빠지고 여기엔 상태만. */}
      <HeaderPanel className="war-command-panel space-y-2">
        <div className="flex flex-wrap gap-1 text-xs">
          <Tooltip
            content={`${TERRAIN_TRAIT_NAME[trait]} — ${terrainTraitDesc(trait)}`}
            align="start"
            className="shrink-0"
            triggerClassName="rounded bg-amber-200 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-200"
          >
            {TERRAIN_TRAIT_NAME[trait]}
          </Tooltip>
          {outpost.neutral && (
            <span className="rounded bg-yellow-400 px-2 py-0.5 text-yellow-900">
              절대 중립
            </span>
          )}
          {occupation && (
            <span
              className="rounded px-2 py-0.5 font-medium text-white"
              style={{
                backgroundColor:
                  occupationGuildColor ?? (ownByMyGuild ? "#10b981" : "#ef4444"),
              }}
            >
              {occupation.occupiedByGuildName ?? "어느 길드"} 점령
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
        {occupation && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            영주 <strong>{lordInfo?.lordName ?? "없음"}</strong>
            <span className="war-resource-line ml-1 tabular-nums">
              · 세금 {(lordInfo?.treasury ?? treasuryGold ?? 0).toLocaleString()}{" "}
              G
            </span>
          </p>
        )}
        {outpost.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {outpost.description}
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
        {V2_SETTLEMENT_WARFARE && warVigor && (
          <WarVigorBar warVigor={warVigor} />
        )}
        {/* 성벽 수동 수리 — 점령 길드 멤버만. 성벽 수리 키트(통나무3+철광석3 조합) 소비. 능동 방어. */}
        {V2_SETTLEMENT_WARFARE &&
          ownByMyGuild &&
          occupation?.fortHp != null &&
          occupation.fortMaxHp != null && (
            <div className="mt-2 space-y-1">
              {occupation.fortHp < occupation.fortMaxHp && (
                <button
                  type="button"
                  onClick={attemptRepair}
                  disabled={repairing || repairKits <= 0}
                  className="w-full rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
                >
                  {repairing
                    ? "수리 중…"
                    : repairKits <= 0
                      ? "성벽 수리 — 수리 키트 없음 (대장간 조합소에서 제작)"
                      : `성벽 수리 — 수리 키트 사용 (1개당 +${FORT_HP_PER_REPAIR_KIT} HP · 보유 ${repairKits}개)`}
                </button>
              )}
              {repairResult && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {repairResult}
                </p>
              )}
            </div>
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
        {(intrusionOutpostId === outpost.id || tileIntrusionActive) &&
          enemyGuildSiege && (
          <div className="war-raid-ready rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
            <div className="font-semibold">
              {tileRaidReady ? "약탈 가능 상태" : "침입자 체류 중"}
            </div>
            <div className="mt-0.5 text-rose-700 dark:text-rose-200/80">
              {tileIntrusionActive
                ? tileRaidReady
                  ? "30분 체류 완료 — 약탈을 시도할 수 있지만 점령 길드가 토벌할 수 있습니다"
                  : `${formatRemainingMinutes(
                      RAID_MIN_TILE_STAY_MS - raidStayElapsedMs,
                    )} 더 버티면 약탈 가능 — 점령 길드가 토벌할 수 있습니다`
                : "이 거점에 침입 중 — 점령 길드가 당신을 토벌할 수 있습니다"}
            </div>
          </div>
        )}

        {ownSettlement ? (
          // 내 거점/정착지 — 마을 / 대장간 / 최근 공격 기록 탭.
          <OutpostActivityTabs
            outpostId={outpost.id}
            activityTab={activityTab}
            onTabChange={setActivityTab}
            canManageSettlement={canManageSettlement}
            attackLogReload={attackLogReload}
          />
        ) : (
          // 비-소유 — 점령/공성 시도.
          <OutpostAttackPanel
            outpostId={outpost.id}
            viewerGuildId={viewerGuildId}
            occupation={occupation}
            showConquer={showConquer}
            claimDisabled={claimDisabled}
            coreLoopOn={coreLoopOn}
            busy={busy}
            raidDisabled={raidDisabled}
            conquerOutOfRange={conquerOutOfRange}
            conquerRazes={conquerRazes}
            attackLogReload={attackLogReload}
            onClaim={attemptClaim}
            onRaid={attemptRaid}
            onConquest={attemptConquest}
          />
        )}

        <OutpostResultCards
          lastClaimResult={lastClaimResult}
          raidResult={raidResult}
          conquestResult={conquestResult}
          outpostName={occupation?.villageName?.trim() || outpost.name}
          coreLoopOn={coreLoopOn}
          onCloseClaim={() => setLastClaimResult(null)}
          onCloseRaid={() => setRaidResult(null)}
          onCloseConquest={() => setConquestResult(null)}
        />
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
    case "raid_solo_unsupported":
      return "개인 정착지는 약탈할 수 없습니다 (정복만 가능)";
    case "raid_stay_required":
      return "해당 정착지 칸에서 30분 이상 체류해야 약탈할 수 있습니다";
    case "not_present":
      return "해당 정착지 칸에 있어야 약탈할 수 있어요 — 지도에서 그 칸으로 이동하세요";
    case "no_foothold":
      return "인접한 우리 영지가 있어야 정복할 수 있어요 (땅이 없으면 중립 거점 옆 칸부터)";
    case "already_yours":
      return "내 거점입니다";
    case "not_owner":
      return "점령 길드 멤버만 할 수 있습니다";
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

function formatRemainingMinutes(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 60_000))}분`;
}

function WarVigorBar({ warVigor }: { warVigor: WarVigor }) {
  const hpPct = Math.round(Math.max(0, Math.min(1, warVigor.hp)) * 100);
  const mpPct = Math.round(Math.max(0, Math.min(1, warVigor.mp)) * 100);
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50/80 px-2.5 py-2 dark:border-rose-900 dark:bg-rose-950/30">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-rose-800 dark:text-rose-200">
          전쟁 건강도
        </span>
        <span className="tabular-nums text-rose-700 dark:text-rose-300">
          HP {hpPct}% · MP {mpPct}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <VigorMeter value={hpPct} tone="hp" />
        <VigorMeter value={mpPct} tone="mp" />
      </div>
    </div>
  );
}

function VigorMeter({ value, tone }: { value: number; tone: "hp" | "mp" }) {
  const fill = tone === "hp" ? "bg-rose-500" : "bg-sky-500";
  const low = value <= 30;
  return (
    <div className="war-meter-track h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={`war-meter-fill h-full rounded-full ${fill} ${low ? "war-vigor-low" : ""}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function computeClaimDisabled(
  outpost: Outpost,
  occupation: OccupationLite,
  viewerUserId: string | null,
  defensePower: number,
  viewerPower: number | null,
  inRange: boolean,
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
  // 현재 위치 게이트 — 현재 거점 또는 인접 1칸에서만 점령 가능(서버 not_adjacent 미러).
  if (!inRange) {
    return {
      reason: "현재 거점 또는 인접 1칸 거점에서만 점령할 수 있어요 — 지도에서 이동하세요",
    };
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
      <div className="war-meter-track h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="war-meter-fill h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
